import { AppError } from '@/domain/errors/AppError';
import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppointmentLifecycleUseCase } from '../AppointmentLifecycleUseCase';
import {
  CAMILA,
  clinicPrincipal,
  FakeOptions,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  OTHER_OWNER,
  OTHER_VET,
  ownerPrincipal,
  SERVICE_BANO,
  VET,
} from './fakes';

const START = new Date('2026-12-07T15:00:00.000Z'); // lunes 10:00 Bogotá
const END = new Date('2026-12-07T15:30:00.000Z');
const LATE_NOW = new Date('2026-12-07T14:50:00.000Z'); // a 10 min del inicio: dentro del plazo de 24 h
const DURING_NOW = new Date('2026-12-07T15:30:00.000Z'); // ya empezó la cita

function setup(options: FakeOptions & { records?: AppointmentRecord[] } = {}) {
  const repo = new InMemoryAppointmentRepository(options.records ?? []);
  const deps = makeDeps({ ...options, repo });
  const lifecycle = new AppointmentLifecycleUseCase({
    appointments: deps.appointments,
    access: deps.access,
    clinicConfig: deps.clinicConfig,
    rules: deps.rules,
    catalog: deps.catalog,
    now: deps.now,
  });
  return { repo, deps, lifecycle };
}

const requested = (over: Partial<AppointmentRecord> = {}) =>
  makeRecord({ id: 'apt-1', status: AppointmentStatus.REQUESTED, startsAt: START, endsAt: END, ...over });

const confirmed = (over: Partial<AppointmentRecord> = {}) =>
  makeRecord({ id: 'apt-1', status: AppointmentStatus.CONFIRMED, startsAt: START, endsAt: END, ...over });

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ status, code });
}

describe('AppointmentLifecycleUseCase — confirmar', () => {
  it('la clínica confirma una cita REQUESTED', async () => {
    const { lifecycle, repo } = setup({ records: [requested()] });
    const record = await lifecycle.confirm(clinicPrincipal(), VET, 'apt-1');

    expect(record.status).toBe(AppointmentStatus.CONFIRMED);
    expect(repo.rows[0].status).toBe(AppointmentStatus.CONFIRMED);
  });

  it('confirmar una cita ya CONFIRMED → 409 APPOINTMENT_INVALID_TRANSITION', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expectAppError(lifecycle.confirm(clinicPrincipal(), VET, 'apt-1'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });

  it('token de dueño → 403 CLINIC_TOKEN_REQUIRED', async () => {
    const { lifecycle } = setup({ records: [requested()] });
    await expectAppError(lifecycle.confirm(ownerPrincipal(), VET, 'apt-1'), 403, 'CLINIC_TOKEN_REQUIRED');
  });

  it('token de otra clínica → 403 TENANT_MISMATCH', async () => {
    const { lifecycle } = setup({ records: [requested()] });
    await expectAppError(lifecycle.confirm(clinicPrincipal(OTHER_VET), VET, 'apt-1'), 403, 'TENANT_MISMATCH');
  });

  it('cita de otra clínica → 404 APPOINTMENT_NOT_FOUND (no revela que existe)', async () => {
    const { lifecycle } = setup({ records: [requested({ veterinaryId: OTHER_VET })] });
    await expectAppError(lifecycle.confirm(clinicPrincipal(), VET, 'apt-1'), 404, 'APPOINTMENT_NOT_FOUND');
  });

  it('cita inexistente → 404 APPOINTMENT_NOT_FOUND', async () => {
    const { lifecycle } = setup({ records: [] });
    await expectAppError(lifecycle.confirm(clinicPrincipal(), VET, 'no-existe'), 404, 'APPOINTMENT_NOT_FOUND');
  });

  it('empleado sin acceso a la mascota → 403 ACCESS_DENIED', async () => {
    const { lifecycle } = setup({
      records: [requested()],
      access: { hasAccess: false, permissions: [] },
    });
    await expectAppError(lifecycle.confirm(clinicPrincipal(), VET, 'apt-1'), 403, 'ACCESS_DENIED');
  });

  it('empleado con acceso pero sin APPOINTMENT_MANAGE → 403 PERMISSION_DENIED', async () => {
    const { lifecycle } = setup({
      records: [requested()],
      access: { permissions: ['CLINICAL_READ'] },
    });
    await expectAppError(lifecycle.confirm(clinicPrincipal(), VET, 'apt-1'), 403, 'PERMISSION_DENIED');
  });
});

describe('AppointmentLifecycleUseCase — rechazar', () => {
  it('la clínica rechaza con motivo: REQUESTED → REJECTED, cancelledBy CLINIC', async () => {
    const { lifecycle } = setup({ records: [requested()] });
    const record = await lifecycle.reject(clinicPrincipal(), VET, 'apt-1', '  No hay cupo  ');

    expect(record.status).toBe(AppointmentStatus.REJECTED);
    expect(record.cancellationReason).toBe('No hay cupo');
    expect(record.cancelledBy).toBe('CLINIC');
  });

  it('sin motivo (vacío o solo espacios) → 400 VALIDATION_ERROR', async () => {
    const { lifecycle } = setup({ records: [requested()] });
    await expectAppError(lifecycle.reject(clinicPrincipal(), VET, 'apt-1', '   '), 400, 'VALIDATION_ERROR');
  });

  it('rechazar una cita CONFIRMED → 409 (solo se rechaza lo solicitado)', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expectAppError(lifecycle.reject(clinicPrincipal(), VET, 'apt-1', 'motivo'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });
});

describe('AppointmentLifecycleUseCase — cancelar', () => {
  it('el dueño cancela con anticipación: CANCELLED, cancelledBy OWNER', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    const record = await lifecycle.cancel(ownerPrincipal(), VET, 'apt-1', 'Ya no puedo ir');

    expect(record.status).toBe(AppointmentStatus.CANCELLED);
    expect(record.cancelledBy).toBe('OWNER');
    expect(record.cancellationReason).toBe('Ya no puedo ir');
  });

  it('el dueño cancela fuera de plazo (menos de 24 h) → 409 CANCELLATION_TOO_LATE', async () => {
    const { lifecycle } = setup({ records: [confirmed()], now: LATE_NOW });
    await expectAppError(lifecycle.cancel(ownerPrincipal(), VET, 'apt-1'), 409, 'CANCELLATION_TOO_LATE');
  });

  it('la clínica cancela aunque esté fuera del plazo del dueño: cancelledBy CLINIC', async () => {
    const { lifecycle } = setup({ records: [confirmed()], now: LATE_NOW });
    const record = await lifecycle.cancel(clinicPrincipal(), VET, 'apt-1');

    expect(record.status).toBe(AppointmentStatus.CANCELLED);
    expect(record.cancelledBy).toBe('CLINIC');
  });

  it('un dueño no puede cancelar una cita ajena → 404 (no revela que existe)', async () => {
    const { lifecycle } = setup({ records: [confirmed({ ownerUserId: OTHER_OWNER })] });
    await expectAppError(lifecycle.cancel(ownerPrincipal(), VET, 'apt-1'), 404, 'NOT_FOUND');
  });

  it('cancelar una cita en CHECKED_IN → 409 (ya llegó a la clínica)', async () => {
    const { lifecycle } = setup({
      records: [confirmed({ status: AppointmentStatus.CHECKED_IN })],
    });
    await expectAppError(lifecycle.cancel(clinicPrincipal(), VET, 'apt-1'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });

  it('cancelar una cita rechazada → 409 (estado final)', async () => {
    const { lifecycle } = setup({
      records: [requested({ status: AppointmentStatus.REJECTED })],
    });
    await expectAppError(lifecycle.cancel(clinicPrincipal(), VET, 'apt-1'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });
});

describe('AppointmentLifecycleUseCase — llegada, completar y no asistió', () => {
  it('check-in: CONFIRMED → CHECKED_IN', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expect(lifecycle.checkIn(clinicPrincipal(), VET, 'apt-1')).resolves.toMatchObject({
      status: AppointmentStatus.CHECKED_IN,
    });
  });

  it('check-in de una cita REQUESTED → 409', async () => {
    const { lifecycle } = setup({ records: [requested()] });
    await expectAppError(lifecycle.checkIn(clinicPrincipal(), VET, 'apt-1'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });

  it('completar: CHECKED_IN → COMPLETED', async () => {
    const { lifecycle } = setup({ records: [confirmed({ status: AppointmentStatus.CHECKED_IN })] });
    await expect(lifecycle.complete(clinicPrincipal(), VET, 'apt-1')).resolves.toMatchObject({
      status: AppointmentStatus.COMPLETED,
    });
  });

  it('completar sin haber hecho check-in → 409', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expectAppError(lifecycle.complete(clinicPrincipal(), VET, 'apt-1'), 409, 'APPOINTMENT_INVALID_TRANSITION');
  });

  it('no asistió antes de que empiece la cita → 409 NO_SHOW_TOO_EARLY', async () => {
    const { lifecycle } = setup({ records: [confirmed()], now: LATE_NOW });
    await expectAppError(lifecycle.noShow(clinicPrincipal(), VET, 'apt-1'), 409, 'NO_SHOW_TOO_EARLY');
  });

  it('no asistió después de empezar la cita: CONFIRMED → NO_SHOW', async () => {
    const { lifecycle } = setup({ records: [confirmed()], now: DURING_NOW });
    await expect(lifecycle.noShow(clinicPrincipal(), VET, 'apt-1')).resolves.toMatchObject({
      status: AppointmentStatus.NO_SHOW,
    });
  });
});

describe('AppointmentLifecycleUseCase — reprogramar', () => {
  const ELEVEN = new Date('2026-12-07T16:00:00.000Z'); // 11:00 Bogotá

  it('la clínica reprograma a otra franja: mantiene el empleado y el horario se actualiza', async () => {
    const { lifecycle, repo } = setup({ records: [confirmed()] });
    const record = await lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', ELEVEN);

    expect(record.startsAt.toISOString()).toBe('2026-12-07T16:00:00.000Z');
    expect(record.endsAt.toISOString()).toBe('2026-12-07T16:30:00.000Z');
    expect(record.employeeId).toBe(LUIS);
    expect(repo.rows[0].startsAt.toISOString()).toBe('2026-12-07T16:00:00.000Z');
  });

  it('reprogramar a la misma franja no choca consigo misma', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expect(lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', START)).resolves.toMatchObject({
      status: AppointmentStatus.CONFIRMED,
    });
  });

  it('nueva franja ocupada por otra cita del mismo empleado → 409 SLOT_UNAVAILABLE', async () => {
    const other = confirmed({ id: 'apt-2', startsAt: ELEVEN, endsAt: new Date('2026-12-07T16:30:00.000Z') });
    const { lifecycle } = setup({ records: [confirmed(), other] });

    await expectAppError(lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', ELEVEN), 409, 'SLOT_UNAVAILABLE');
  });

  it('nueva franja fuera del horario (19:00 Bogotá) → 409 SLOT_UNAVAILABLE', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expectAppError(
      lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', new Date('2026-12-08T00:00:00.000Z')),
      409,
      'SLOT_UNAVAILABLE'
    );
  });

  it('una cita CHECKED_IN no se reprograma → 409 APPOINTMENT_NOT_RESCHEDULABLE', async () => {
    const { lifecycle } = setup({ records: [confirmed({ status: AppointmentStatus.CHECKED_IN })] });
    await expectAppError(
      lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', ELEVEN),
      409,
      'APPOINTMENT_NOT_RESCHEDULABLE'
    );
  });

  it('el dueño reprograma dentro del plazo', async () => {
    const { lifecycle } = setup({ records: [confirmed()] });
    await expect(lifecycle.reschedule(ownerPrincipal(), VET, 'apt-1', ELEVEN)).resolves.toMatchObject({
      startsAt: ELEVEN,
    });
  });

  it('el dueño reprograma fuera del plazo → 409 CANCELLATION_TOO_LATE', async () => {
    const { lifecycle } = setup({ records: [confirmed()], now: LATE_NOW });
    await expectAppError(lifecycle.reschedule(ownerPrincipal(), VET, 'apt-1', ELEVEN), 409, 'CANCELLATION_TOO_LATE');
  });

  it('reprogramar un baño mantiene a Camila, la única empleada elegible', async () => {
    // Baño de 60 min con Camila; se mueve a las 11:00 Bogotá, donde ella está libre
    const bath = confirmed({
      serviceId: SERVICE_BANO,
      employeeId: CAMILA,
      durationMinutes: 60,
      endsAt: new Date('2026-12-07T16:00:00.000Z'),
    });
    const { lifecycle } = setup({ records: [bath] });
    const record = await lifecycle.reschedule(clinicPrincipal(), VET, 'apt-1', ELEVEN);
    expect(record.employeeId).toBe(CAMILA);
  });
});
