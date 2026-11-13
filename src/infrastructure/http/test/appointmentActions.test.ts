import { AppError } from '@/domain/errors/AppError';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppointmentLifecycleUseCase } from '@/application/use-cases/AppointmentLifecycleUseCase';
import { ClinicAgendaUseCase, OwnerAppointmentsUseCase } from '@/application/use-cases/AppointmentQueriesUseCase';
import {
  clinicPrincipal,
  InMemoryAppointmentRepository,
  makeDeps,
  makeRecord,
  NOW,
  ownerPrincipal,
  OWNER,
  VET,
} from '@/application/use-cases/test/fakes';
import {
  handleAppointmentAction,
  handleClinicAgenda,
  handleOwnerAppointments,
  parseActionBody,
  parseAgendaQuery,
} from '../appointmentHandlers';

// Autenticación de prueba: "Bearer clinica" o "Bearer dueno"
const authenticate = async (authorization: string | null | undefined) => {
  if (!authorization) throw new AppError(401, 'MISSING_TOKEN', 'Falta el header Authorization');
  if (authorization === 'Bearer clinica') return clinicPrincipal(VET);
  if (authorization === 'Bearer dueno') return ownerPrincipal();
  throw new AppError(401, 'INVALID_TOKEN', 'Token inválido');
};

const START = new Date('2026-12-07T15:00:00.000Z'); // lunes 10:00 Bogotá
const END = new Date('2026-12-07T15:30:00.000Z');
const ELEVEN = new Date('2026-12-07T16:00:00.000Z'); // 11:00 Bogotá
const DURING = new Date('2026-12-07T15:30:00.000Z');

function lifecycleWith(records: ReturnType<typeof makeRecord>[], now: Date = NOW) {
  const repo = new InMemoryAppointmentRepository(records);
  const deps = makeDeps({ repo, now });
  const lifecycle = new AppointmentLifecycleUseCase({
    appointments: deps.appointments,
    access: deps.access,
    clinicConfig: deps.clinicConfig,
    rules: deps.rules,
    catalog: deps.catalog,
    now: deps.now,
  });
  return { lifecycle, repo };
}

const apt = (over: Partial<ReturnType<typeof makeRecord>> = {}) =>
  makeRecord({ id: 'apt-1', status: AppointmentStatus.CONFIRMED, startsAt: START, endsAt: END, ...over });

const actionReq = (action: string, authorization: string | undefined, body: unknown = undefined, now: Date = NOW) => ({
  authorization,
  veterinaryId: VET,
  appointmentId: 'apt-1',
  action,
  body,
  now,
});

describe('parseAgendaQuery', () => {
  it('acepta from y to, y convierte a Date', () => {
    const params = new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z');
    const q = parseAgendaQuery(params);
    expect(q.from.toISOString()).toBe('2026-12-07T05:00:00.000Z');
    expect(q.statuses).toBeUndefined();
  });

  it('falta from → 400', () => {
    expect(() => parseAgendaQuery(new URLSearchParams('to=2026-12-08T05:00:00.000Z'))).toThrow(/from/);
  });

  it('status con varios valores separados por coma', () => {
    const q = parseAgendaQuery(
      new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z&status=REQUESTED, CONFIRMED')
    );
    expect(q.statuses).toEqual(['REQUESTED', 'CONFIRMED']);
  });

  it('un estado desconocido → 400 con su nombre', () => {
    expect(() =>
      parseAgendaQuery(new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z&status=VOLADOR'))
    ).toThrow(/VOLADOR/);
  });

  it('employeeId opcional', () => {
    const q = parseAgendaQuery(
      new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z&employeeId=emp-9')
    );
    expect(q.employeeId).toBe('emp-9');
  });
});

describe('parseActionBody', () => {
  it('confirm, check-in, complete y no-show no necesitan cuerpo', () => {
    expect(parseActionBody('confirm', undefined)).toEqual({});
    expect(parseActionBody('check-in', undefined)).toEqual({});
    expect(parseActionBody('complete', undefined)).toEqual({});
    expect(parseActionBody('no-show', undefined)).toEqual({});
  });

  it('reject exige reason', () => {
    expect(() => parseActionBody('reject', {})).toThrow(/reason/);
    expect(parseActionBody('reject', { reason: 'No hay cupo' })).toEqual({ reason: 'No hay cupo' });
  });

  it('cancel acepta cuerpo vacío o con reason opcional', () => {
    expect(parseActionBody('cancel', undefined)).toEqual({});
    expect(parseActionBody('cancel', { reason: 'Ya no puedo' })).toEqual({ reason: 'Ya no puedo' });
    expect(parseActionBody('cancel', { reason: null })).toEqual({});
  });

  it('cancel con reason demasiado largo → 400', () => {
    expect(() => parseActionBody('cancel', { reason: 'x'.repeat(501) })).toThrow(/reason/);
  });

  it('reschedule exige startsAt válido', () => {
    expect(() => parseActionBody('reschedule', {})).toThrow(/startsAt/);
    expect(() => parseActionBody('reschedule', { startsAt: 'mañana' })).toThrow(/startsAt/);
    expect(parseActionBody('reschedule', { startsAt: '2026-12-07T16:00:00.000Z' }).startsAt).toEqual(ELEVEN);
  });
});

describe('handleAppointmentAction', () => {
  it('acción desconocida → 404 ACTION_NOT_FOUND', async () => {
    const { lifecycle } = lifecycleWith([apt()]);
    const result = await handleAppointmentAction(actionReq('volar', 'Bearer clinica'), { authenticate, lifecycle });
    expect(result.status).toBe(404);
    expect((result.body as { code: string }).code).toBe('ACTION_NOT_FOUND');
  });

  it('sin token → 401', async () => {
    const { lifecycle } = lifecycleWith([apt()]);
    const result = await handleAppointmentAction(actionReq('confirm', undefined), { authenticate, lifecycle });
    expect(result.status).toBe(401);
  });

  it('la clínica confirma una cita REQUESTED → 200 CONFIRMED', async () => {
    const { lifecycle } = lifecycleWith([apt({ status: AppointmentStatus.REQUESTED })]);
    const result = await handleAppointmentAction(actionReq('confirm', 'Bearer clinica'), { authenticate, lifecycle });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 'apt-1', status: 'CONFIRMED' });
  });

  it('reject sin reason → 400 VALIDATION_ERROR', async () => {
    const { lifecycle } = lifecycleWith([apt({ status: AppointmentStatus.REQUESTED })]);
    const result = await handleAppointmentAction(actionReq('reject', 'Bearer clinica', {}), { authenticate, lifecycle });
    expect(result.status).toBe(400);
  });

  it('reject con reason → 200 REJECTED con motivo', async () => {
    const { lifecycle } = lifecycleWith([apt({ status: AppointmentStatus.REQUESTED })]);
    const result = await handleAppointmentAction(
      actionReq('reject', 'Bearer clinica', { reason: 'No hay cupo' }),
      { authenticate, lifecycle }
    );
    expect(result.body).toMatchObject({ status: 'REJECTED', cancellationReason: 'No hay cupo', cancelledBy: 'CLINIC' });
  });

  it('el dueño cancela sin cuerpo → 200 CANCELLED, cancelledBy OWNER', async () => {
    const { lifecycle } = lifecycleWith([apt({ ownerUserId: OWNER })]);
    const result = await handleAppointmentAction(actionReq('cancel', 'Bearer dueno'), { authenticate, lifecycle });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'OWNER' });
  });

  it('no asistió antes del inicio → 409 NO_SHOW_TOO_EARLY', async () => {
    const { lifecycle } = lifecycleWith([apt()], NOW);
    const result = await handleAppointmentAction(actionReq('no-show', 'Bearer clinica', undefined, NOW), {
      authenticate,
      lifecycle,
    });
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe('NO_SHOW_TOO_EARLY');
  });

  it('no asistió después del inicio → 200 NO_SHOW', async () => {
    const { lifecycle } = lifecycleWith([apt()], DURING);
    const result = await handleAppointmentAction(actionReq('no-show', 'Bearer clinica', undefined, DURING), {
      authenticate,
      lifecycle,
    });
    expect(result.body).toMatchObject({ status: 'NO_SHOW' });
  });

  it('reprogramar a 11:00 → 200 con la nueva hora', async () => {
    const { lifecycle } = lifecycleWith([apt()]);
    const result = await handleAppointmentAction(
      actionReq('reschedule', 'Bearer clinica', { startsAt: '2026-12-07T16:00:00.000Z' }),
      { authenticate, lifecycle }
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ startsAt: '2026-12-07T16:00:00.000Z', endsAt: '2026-12-07T16:30:00.000Z' });
  });

  it('reprogramar sin startsAt → 400', async () => {
    const { lifecycle } = lifecycleWith([apt()]);
    const result = await handleAppointmentAction(actionReq('reschedule', 'Bearer clinica', {}), {
      authenticate,
      lifecycle,
    });
    expect(result.status).toBe(400);
  });

  it('una acción de la clínica con token de dueño → 403 CLINIC_TOKEN_REQUIRED', async () => {
    const { lifecycle } = lifecycleWith([apt()]);
    const result = await handleAppointmentAction(actionReq('confirm', 'Bearer dueno'), { authenticate, lifecycle });
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('CLINIC_TOKEN_REQUIRED');
  });
});

describe('handleClinicAgenda', () => {
  const agendaReq = (authorization: string | undefined, query = 'from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z') => ({
    authorization,
    veterinaryId: VET,
    params: new URLSearchParams(query),
    now: NOW,
  });

  const build = () => {
    const repo = new InMemoryAppointmentRepository([apt()]);
    const staff = {
      getPermissions: async (vet: string, user: string) =>
        vet === VET && user === 'clinic-user-1' ? ['APPOINTMENT_MANAGE'] : null,
    };
    return { agenda: new ClinicAgendaUseCase({ appointments: repo, staff }) };
  };

  it('200 con la lista de citas del día', async () => {
    const result = await handleClinicAgenda(agendaReq('Bearer clinica'), { authenticate, agenda: build().agenda });
    expect(result.status).toBe(200);
    expect((result.body as { appointments: unknown[] }).appointments).toHaveLength(1);
  });

  it('sin "to" → 400', async () => {
    const result = await handleClinicAgenda(agendaReq('Bearer clinica', 'from=2026-12-07T05:00:00.000Z'), {
      authenticate,
      agenda: build().agenda,
    });
    expect(result.status).toBe(400);
  });

  it('token de dueño → 403', async () => {
    const result = await handleClinicAgenda(agendaReq('Bearer dueno'), { authenticate, agenda: build().agenda });
    expect(result.status).toBe(403);
  });
});

describe('handleOwnerAppointments', () => {
  it('200 con las citas del dueño y el nombre de la clínica', async () => {
    const deps = makeDeps({ repo: new InMemoryAppointmentRepository([apt({ ownerUserId: OWNER })]) });
    const owner = new OwnerAppointmentsUseCase({ appointments: deps.appointments, clinicConfig: deps.clinicConfig });

    const result = await handleOwnerAppointments(
      {
        authorization: 'Bearer dueno',
        params: new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z'),
        now: NOW,
      },
      { authenticate, owner }
    );

    expect(result.status).toBe(200);
    const list = (result.body as { appointments: { clinicName: string }[] }).appointments;
    expect(list).toHaveLength(1);
    expect(list[0].clinicName).toBe('Clínica Patitas');
  });

  it('token de clínica → 403 OWNER_TOKEN_REQUIRED', async () => {
    const deps = makeDeps();
    const owner = new OwnerAppointmentsUseCase({ appointments: deps.appointments, clinicConfig: deps.clinicConfig });
    const result = await handleOwnerAppointments(
      {
        authorization: 'Bearer clinica',
        params: new URLSearchParams('from=2026-12-07T05:00:00.000Z&to=2026-12-08T05:00:00.000Z'),
        now: NOW,
      },
      { authenticate, owner }
    );
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('OWNER_TOKEN_REQUIRED');
  });
});
