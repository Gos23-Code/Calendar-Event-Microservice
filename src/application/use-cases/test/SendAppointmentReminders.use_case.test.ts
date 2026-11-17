import { AppointmentEventMessage } from '@/domain/entities/AppointmentEvent';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';
import { AppointmentNotifier } from '@/application/services/AppointmentNotifier';
import { SendAppointmentRemindersUseCase } from '../SendAppointmentRemindersUseCase';
import { InMemoryAppointmentRepository, makeDeps, makeRecord, OWNER, PET_NO_APP } from './fakes';

// Ahora: 2026-12-06 10:00 UTC. La ventana 23–24 h cubre citas entre 2026-12-07 09:00 y 10:00 UTC.
const NOW_AT = new Date('2026-12-06T10:00:00.000Z');
const IN_WINDOW = new Date('2026-12-07T09:30:00.000Z'); // dentro de la ventana
const OUT_WINDOW = new Date('2026-12-06T15:00:00.000Z'); // dentro de 5 h, fuera de la ventana

class RecordingPublisher implements IAppointmentEventPublisher {
  messages: AppointmentEventMessage[] = [];
  fail = false;

  async publish(message: AppointmentEventMessage): Promise<void> {
    if (this.fail) throw new Error('Pub/Sub no responde');
    this.messages.push(message);
  }
}

function setup(records: ReturnType<typeof makeRecord>[], options: { enabled?: boolean; failing?: boolean } = {}) {
  const repo = new InMemoryAppointmentRepository(records);
  const deps = makeDeps({ repo });
  const publisher = new RecordingPublisher();
  publisher.fail = options.failing ?? false;

  const notifier = new AppointmentNotifier({
    publisher,
    clinicConfig: deps.clinicConfig,
    pets: deps.pets,
    newId: () => 'corr',
    now: () => NOW_AT,
    enabled: options.enabled ?? true,
  });

  const job = new SendAppointmentRemindersUseCase({ appointments: repo, notifier, now: () => NOW_AT });
  return { repo, publisher, job };
}

const reminderCandidate = (over: Partial<ReturnType<typeof makeRecord>> = {}) =>
  makeRecord({
    id: 'apt-1',
    status: AppointmentStatus.CONFIRMED,
    startsAt: IN_WINDOW,
    endsAt: new Date('2026-12-07T10:00:00.000Z'),
    ...over,
  });

describe('SendAppointmentRemindersUseCase', () => {
  it('envía el recordatorio de una cita confirmada en la ventana y lo marca', async () => {
    const { job, publisher, repo } = setup([reminderCandidate()]);

    const result = await job.run();

    expect(result).toEqual({ enabled: true, checked: 1, sent: 1, skipped: 0, failed: 0 });
    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_REMINDER', userId: OWNER });
    expect(repo.rows[0].reminderSentAt).toEqual(NOW_AT);
  });

  it('no toma citas fuera de la ventana de 23–24 h', async () => {
    const { job, publisher } = setup([reminderCandidate({ startsAt: OUT_WINDOW, endsAt: new Date('2026-12-06T15:30:00.000Z') })]);

    const result = await job.run();

    expect(result.checked).toBe(0);
    expect(publisher.messages).toHaveLength(0);
  });

  it('no toma citas solicitadas (solo confirmadas)', async () => {
    const { job } = setup([reminderCandidate({ status: AppointmentStatus.REQUESTED })]);
    await expect(job.run()).resolves.toMatchObject({ checked: 0 });
  });

  it('es idempotente: correr el job dos veces no repite el recordatorio', async () => {
    const { job, publisher } = setup([reminderCandidate()]);

    await job.run();
    const second = await job.run();

    expect(second.checked).toBe(0);
    expect(publisher.messages).toHaveLength(1);
  });

  it('dueño sin app: se cuenta como omitido y no se marca', async () => {
    const { job, repo } = setup([reminderCandidate({ ownerUserId: null, petId: PET_NO_APP })]);

    const result = await job.run();

    expect(result).toMatchObject({ checked: 1, sent: 0, skipped: 1 });
    expect(repo.rows[0].reminderSentAt).toBeNull();
  });

  it('si Pub/Sub falla, cuenta el fallo y no marca el recordatorio', async () => {
    const { job, repo } = setup([reminderCandidate()], { failing: true });

    const result = await job.run();

    expect(result).toMatchObject({ checked: 1, sent: 0, failed: 1 });
    expect(repo.rows[0].reminderSentAt).toBeNull();
  });

  it('con EVENTS_ENABLED apagado no revisa nada ni marca', async () => {
    const { job, repo } = setup([reminderCandidate()], { enabled: false });

    const result = await job.run();

    expect(result).toEqual({ enabled: false, checked: 0, sent: 0, skipped: 0, failed: 0 });
    expect(repo.rows[0].reminderSentAt).toBeNull();
  });
});
