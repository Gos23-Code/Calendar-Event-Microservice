import { AppointmentEventMessage } from '@/domain/entities/AppointmentEvent';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';
import { AppointmentNotifier } from '@/application/services/AppointmentNotifier';
import { CreateClinicAppointmentUseCase } from '../CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '../RequestAppointmentUseCase';
import { AppointmentLifecycleUseCase } from '../AppointmentLifecycleUseCase';
import {
  clinicPrincipal,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  NOW,
  OWNER,
  ownerPrincipal,
  PET,
  SLOT_10AM,
  SERVICE,
  VET,
} from './fakes';

// Publicador que guarda los mensajes; `fail` simula una caída de Pub/Sub.
class RecordingPublisher implements IAppointmentEventPublisher {
  messages: AppointmentEventMessage[] = [];
  fail = false;

  async publish(message: AppointmentEventMessage): Promise<void> {
    if (this.fail) throw new Error('Pub/Sub no responde');
    this.messages.push(message);
  }
}

function build(options: { config?: object; records?: ReturnType<typeof makeRecord>[]; enabled?: boolean; failing?: boolean } = {}) {
  const repo = new InMemoryAppointmentRepository(options.records ?? []);
  const deps = makeDeps({ repo, config: options.config as never });
  const publisher = new RecordingPublisher();
  publisher.fail = options.failing ?? false;

  const notifier = new AppointmentNotifier({
    publisher,
    clinicConfig: deps.clinicConfig,
    pets: deps.pets,
    newId: () => 'corr',
    now: () => NOW,
    enabled: options.enabled ?? true,
  });

  const shared = {
    rules: deps.rules,
    appointments: deps.appointments,
    catalog: deps.catalog,
    pets: deps.pets,
    clinicConfig: deps.clinicConfig,
    newId: () => 'apt-new',
    now: () => NOW,
    notifier,
  };

  return {
    repo,
    publisher,
    create: new CreateClinicAppointmentUseCase({ ...shared, access: deps.access, clinicConfig: deps.clinicConfig }),
    request: new RequestAppointmentUseCase(shared),
    lifecycle: new AppointmentLifecycleUseCase({
      appointments: deps.appointments,
      access: deps.access,
      clinicConfig: deps.clinicConfig,
      rules: deps.rules,
      catalog: deps.catalog,
      now: deps.now,
      notifier,
    }),
  };
}

const requested = () =>
  makeRecord({ id: 'apt-1', status: AppointmentStatus.REQUESTED, ownerUserId: OWNER });
const confirmed = (over = {}) =>
  makeRecord({ id: 'apt-1', status: AppointmentStatus.CONFIRMED, ownerUserId: OWNER, ...over });

const baseClinicInput = { veterinaryId: VET, serviceId: SERVICE, petId: PET, employeeId: LUIS, startsAt: SLOT_10AM };
const baseOwnerInput = { veterinaryId: VET, serviceId: SERVICE, petId: PET, startsAt: SLOT_10AM };

describe('eventos al crear', () => {
  it('la clínica crea una cita: CONFIRMED al dueño', async () => {
    const { create, publisher } = build();
    await create.execute(clinicPrincipal(), baseClinicInput);

    expect(publisher.messages).toHaveLength(1);
    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_CONFIRMED', userId: OWNER });
  });

  it('el dueño pide una cita que requiere confirmación: REQUESTED a la clínica', async () => {
    const { request, publisher } = build({ config: { bookingRequiresConfirmation: true } });
    await request.execute(ownerPrincipal(), baseOwnerInput);

    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_REQUESTED', userId: null });
    expect(publisher.messages[0].recipient?.name).toBe('Clínica Patitas');
  });

  it('el dueño pide una cita confirmada automáticamente: CONFIRMED al dueño', async () => {
    const { request, publisher } = build({ config: { bookingRequiresConfirmation: false } });
    await request.execute(ownerPrincipal(), baseOwnerInput);

    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_CONFIRMED', userId: OWNER });
  });
});

describe('eventos de las acciones', () => {
  it('confirmar: CONFIRMED al dueño', async () => {
    const { lifecycle, publisher } = build({ records: [requested()] });
    await lifecycle.confirm(clinicPrincipal(), VET, 'apt-1');
    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_CONFIRMED', userId: OWNER });
  });

  it('rechazar: REJECTED al dueño con el motivo en el payload', async () => {
    const { lifecycle, publisher } = build({ records: [requested()] });
    await lifecycle.reject(clinicPrincipal(), VET, 'apt-1', 'No hay cupo');

    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_REJECTED', userId: OWNER });
    expect(publisher.messages[0].payload.cancellationReason).toBe('No hay cupo');
  });

  it('cancelar el dueño: CANCELLED a la clínica', async () => {
    const { lifecycle, publisher } = build({ records: [confirmed()] });
    await lifecycle.cancel(ownerPrincipal(), VET, 'apt-1');

    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_CANCELLED', userId: null });
    expect(publisher.messages[0].recipient?.name).toBe('Clínica Patitas');
  });

  it('completar: COMPLETED al dueño', async () => {
    const { lifecycle, publisher } = build({ records: [confirmed({ status: AppointmentStatus.CHECKED_IN })] });
    await lifecycle.complete(clinicPrincipal(), VET, 'apt-1');
    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_COMPLETED', userId: OWNER });
  });

  it('reprogramar por la clínica: RESCHEDULED al dueño, y el recordatorio se reinicia', async () => {
    const { lifecycle, publisher, repo } = build({
      records: [confirmed({ reminderSentAt: new Date('2026-12-05T00:00:00.000Z') })],
    });
    await lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', new Date('2026-12-07T16:00:00.000Z'));

    expect(publisher.messages[0]).toMatchObject({ eventType: 'APPOINTMENT_RESCHEDULED', userId: OWNER });
    expect(repo.rows[0].reminderSentAt).toBeNull();
  });

  it('check-in y no asistió no generan evento', async () => {
    const { lifecycle, publisher } = build({ records: [confirmed()] });
    await lifecycle.checkIn(clinicPrincipal(), VET, 'apt-1');
    expect(publisher.messages).toHaveLength(0);
  });
});

describe('fallas de publicación', () => {
  it('si Pub/Sub cae, la acción igual queda guardada y responde con normalidad', async () => {
    const { lifecycle, repo, publisher } = build({ records: [requested()], failing: true });

    const record = await lifecycle.confirm(clinicPrincipal(), VET, 'apt-1');

    expect(record.status).toBe(AppointmentStatus.CONFIRMED);
    expect(repo.rows[0].status).toBe(AppointmentStatus.CONFIRMED);
    expect(publisher.messages).toHaveLength(0);
  });

  it('con EVENTS_ENABLED apagado no se publica nada, pero la acción sí se hace', async () => {
    const { lifecycle, publisher, repo } = build({ records: [requested()], enabled: false });

    await lifecycle.confirm(clinicPrincipal(), VET, 'apt-1');

    expect(publisher.messages).toHaveLength(0);
    expect(repo.rows[0].status).toBe(AppointmentStatus.CONFIRMED);
  });
});
