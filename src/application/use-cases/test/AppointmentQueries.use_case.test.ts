import { AppError } from '@/domain/errors/AppError';
import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { IStaffDirectory } from '@/domain/interfaces/IStaffDirectory';
import { ClinicAgendaUseCase, OwnerAppointmentsUseCase } from '../AppointmentQueriesUseCase';
import {
  CLINIC_USER,
  clinicPrincipal,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  OTHER_OWNER,
  OTHER_VET,
  OWNER,
  ownerPrincipal,
  SARA,
  VET,
} from './fakes';

const DAY_START = new Date('2026-12-07T05:00:00.000Z'); // lunes 00:00 Bogotá
const DAY_END = new Date('2026-12-08T05:00:00.000Z');

const staffWith = (permissions: string[] | null): IStaffDirectory => ({
  getPermissions: jest.fn(async (vetId: string, userId: string) =>
    vetId === VET && userId === CLINIC_USER ? permissions : null
  ),
});

const rec = (over: Partial<AppointmentRecord>) => makeRecord(over);

describe('ClinicAgendaUseCase', () => {
  const build = (records: AppointmentRecord[], staff: IStaffDirectory = staffWith(['APPOINTMENT_MANAGE'])) => {
    const repo = new InMemoryAppointmentRepository(records);
    return { useCase: new ClinicAgendaUseCase({ appointments: repo, staff }), repo, staff };
  };

  it('devuelve las citas del día ordenadas por hora de inicio', async () => {
    const { useCase } = build([
      rec({ id: 'b', startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
      rec({ id: 'a', startsAt: new Date('2026-12-07T15:00:00.000Z'), endsAt: new Date('2026-12-07T15:30:00.000Z') }),
    ]);

    const list = await useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END });
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('filtra por empleado', async () => {
    const { useCase } = build([
      rec({ id: 'luis', employeeId: LUIS }),
      rec({ id: 'sara', employeeId: SARA, startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
    ]);

    const list = await useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END, employeeId: SARA });
    expect(list.map((r) => r.id)).toEqual(['sara']);
  });

  it('filtra por estado (lista separada por comas)', async () => {
    const { useCase } = build([
      rec({ id: 'req', status: AppointmentStatus.REQUESTED }),
      rec({ id: 'conf', status: AppointmentStatus.CONFIRMED, startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
      rec({ id: 'cancel', status: AppointmentStatus.CANCELLED, startsAt: new Date('2026-12-07T17:00:00.000Z'), endsAt: new Date('2026-12-07T17:30:00.000Z') }),
    ]);

    const list = await useCase.list(clinicPrincipal(), VET, {
      from: DAY_START,
      to: DAY_END,
      statuses: [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED],
    });
    expect(list.map((r) => r.id)).toEqual(['req', 'conf']);
  });

  it('no incluye citas fuera del rango', async () => {
    const { useCase } = build([
      rec({ id: 'otro-dia', startsAt: new Date('2026-12-09T15:00:00.000Z'), endsAt: new Date('2026-12-09T15:30:00.000Z') }),
    ]);
    await expect(useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END })).resolves.toEqual([]);
  });

  it('token de dueño → 403 CLINIC_TOKEN_REQUIRED', async () => {
    const { useCase } = build([]);
    await expect(useCase.list(ownerPrincipal(), VET, { from: DAY_START, to: DAY_END })).rejects.toMatchObject({
      status: 403,
      code: 'CLINIC_TOKEN_REQUIRED',
    });
  });

  it('token de otra clínica → 403 TENANT_MISMATCH', async () => {
    const { useCase } = build([]);
    await expect(useCase.list(clinicPrincipal(OTHER_VET), VET, { from: DAY_START, to: DAY_END })).rejects.toMatchObject({
      status: 403,
      code: 'TENANT_MISMATCH',
    });
  });

  it('usuario que no pertenece a la clínica → 404', async () => {
    const { useCase } = build([], staffWith(null));
    await expect(useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('miembro sin APPOINTMENT_MANAGE → 403 PERMISSION_DENIED', async () => {
    const { useCase } = build([], staffWith(['CLINICAL_READ']));
    await expect(useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END })).rejects.toMatchObject({
      status: 403,
      code: 'PERMISSION_DENIED',
    });
  });

  it('rango inválido (to antes de from) → 400', async () => {
    const { useCase } = build([]);
    await expect(useCase.list(clinicPrincipal(), VET, { from: DAY_END, to: DAY_START })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rango de más de 31 días → 400', async () => {
    const { useCase } = build([]);
    const far = new Date(DAY_START.getTime() + 40 * 24 * 60 * 60 * 1000);
    await expect(useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: far })).rejects.toBeInstanceOf(AppError);
  });

  it('consulta los permisos del empleado de la clínica correcta', async () => {
    const { useCase, staff } = build([]);
    await useCase.list(clinicPrincipal(), VET, { from: DAY_START, to: DAY_END });
    expect(staff.getPermissions).toHaveBeenCalledWith(VET, CLINIC_USER);
  });
});

describe('OwnerAppointmentsUseCase', () => {
  const build = (records: AppointmentRecord[], clinicConfigNull = false) => {
    const deps = makeDeps({ repo: new InMemoryAppointmentRepository(records) });
    const clinicConfig = clinicConfigNull
      ? { get: jest.fn(async () => null) }
      : deps.clinicConfig;
    return { useCase: new OwnerAppointmentsUseCase({ appointments: deps.appointments, clinicConfig }), clinicConfig };
  };

  it('devuelve solo las citas del dueño, con el nombre de la clínica', async () => {
    const { useCase } = build([
      rec({ id: 'mia', ownerUserId: OWNER }),
      rec({ id: 'ajena', ownerUserId: OTHER_OWNER, startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
    ]);

    const views = await useCase.list(ownerPrincipal(), DAY_START, DAY_END);
    expect(views.map((v) => v.appointment.id)).toEqual(['mia']);
    expect(views[0].clinicName).toBe('Clínica Patitas');
  });

  it('consulta cada clínica una sola vez aunque tenga varias citas', async () => {
    const { useCase, clinicConfig } = build([
      rec({ id: 'a', ownerUserId: OWNER }),
      rec({ id: 'b', ownerUserId: OWNER, startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
    ]);

    await useCase.list(ownerPrincipal(), DAY_START, DAY_END);
    expect(clinicConfig.get).toHaveBeenCalledTimes(1);
  });

  it('si la clínica no existe, el nombre queda null', async () => {
    const { useCase } = build([rec({ ownerUserId: OWNER })], true);
    const views = await useCase.list(ownerPrincipal(), DAY_START, DAY_END);
    expect(views[0].clinicName).toBeNull();
  });

  it('token de clínica → 403 OWNER_TOKEN_REQUIRED', async () => {
    const { useCase } = build([]);
    await expect(useCase.list(clinicPrincipal(), DAY_START, DAY_END)).rejects.toMatchObject({
      status: 403,
      code: 'OWNER_TOKEN_REQUIRED',
    });
  });

  it('rango inválido → 400', async () => {
    const { useCase } = build([]);
    await expect(useCase.list(ownerPrincipal(), DAY_END, DAY_START)).rejects.toMatchObject({ status: 400 });
  });

  it('incluye citas de todas las clínicas del dueño', async () => {
    const { useCase } = build([
      rec({ id: 'v1', veterinaryId: VET, ownerUserId: OWNER }),
      rec({ id: 'v2', veterinaryId: OTHER_VET, ownerUserId: OWNER, startsAt: new Date('2026-12-07T16:00:00.000Z'), endsAt: new Date('2026-12-07T16:30:00.000Z') }),
    ]);
    const views = await useCase.list(ownerPrincipal(), DAY_START, DAY_END);
    expect(views.map((v) => v.appointment.veterinaryId).sort()).toEqual([OTHER_VET, VET].sort());
  });
});
