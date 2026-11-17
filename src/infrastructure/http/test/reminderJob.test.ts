import { SendAppointmentRemindersUseCase } from '@/application/use-cases/SendAppointmentRemindersUseCase';
import { AppointmentNotifier } from '@/application/services/AppointmentNotifier';
import { InMemoryAppointmentRepository, makeDeps } from '@/application/use-cases/test/fakes';
import { eventsEnabled } from '@/infrastructure/composition/appointmentDependencies';
import { handleSendReminders } from '../appointmentHandlers';

const EXPECTED_KEY = 'clave-interna-de-prueba';
const NOW_AT = new Date('2026-12-06T10:00:00.000Z');

function jobWithEvents(enabled: boolean) {
  const deps = makeDeps();
  const notifier = new AppointmentNotifier({
    publisher: { publish: async () => undefined },
    clinicConfig: deps.clinicConfig,
    pets: deps.pets,
    newId: () => 'c',
    now: () => NOW_AT,
    enabled,
  });
  return new SendAppointmentRemindersUseCase({
    appointments: new InMemoryAppointmentRepository([]),
    notifier,
    now: () => NOW_AT,
  });
}

describe('handleSendReminders (job con clave interna)', () => {
  it('sin clave interna → 401 INVALID_INTERNAL_KEY y no corre el job', async () => {
    const job = jobWithEvents(true);
    const spy = jest.spyOn(job, 'run');

    const result = await handleSendReminders({ internalApiKey: undefined, now: NOW_AT }, { expectedKey: EXPECTED_KEY, job });

    expect(result.status).toBe(401);
    expect((result.body as { code: string }).code).toBe('INVALID_INTERNAL_KEY');
    expect(spy).not.toHaveBeenCalled();
  });

  it('clave incorrecta → 401', async () => {
    const result = await handleSendReminders(
      { internalApiKey: 'otra-clave', now: NOW_AT },
      { expectedKey: EXPECTED_KEY, job: jobWithEvents(true) }
    );
    expect(result.status).toBe(401);
  });

  it('clave correcta → 200 con el resultado del job', async () => {
    const result = await handleSendReminders(
      { internalApiKey: EXPECTED_KEY, now: NOW_AT },
      { expectedKey: EXPECTED_KEY, job: jobWithEvents(true) }
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ enabled: true, checked: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it('con EVENTS_ENABLED apagado responde 200 con enabled = false', async () => {
    const result = await handleSendReminders(
      { internalApiKey: EXPECTED_KEY, now: NOW_AT },
      { expectedKey: EXPECTED_KEY, job: jobWithEvents(false) }
    );
    expect(result.body).toMatchObject({ enabled: false });
  });
});

describe('eventsEnabled (flag EVENTS_ENABLED)', () => {
  it('apagado por defecto', () => {
    expect(eventsEnabled({})).toBe(false);
  });

  it('solo "true" lo enciende', () => {
    expect(eventsEnabled({ EVENTS_ENABLED: 'true' })).toBe(true);
    expect(eventsEnabled({ EVENTS_ENABLED: ' true ' })).toBe(true);
    expect(eventsEnabled({ EVENTS_ENABLED: 'yes' })).toBe(false);
    expect(eventsEnabled({ EVENTS_ENABLED: '1' })).toBe(false);
  });
});
