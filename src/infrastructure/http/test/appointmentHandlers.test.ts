import { AppError } from '@/domain/errors/AppError';
import { CreateClinicAppointmentUseCase } from '@/application/use-cases/CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '@/application/use-cases/RequestAppointmentUseCase';
import {
  clinicPrincipal,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  NOW,
  ownerPrincipal,
  PET,
  SARA,
  SERVICE,
  SLOT_10AM,
  VET,
} from '@/application/use-cases/test/fakes';
import {
  handleCreateClinicAppointment,
  handleRequestAppointment,
  parseClinicBody,
  parseRequestBody,
} from '../appointmentHandlers';

const VALID_CLINIC_BODY = {
  serviceId: SERVICE,
  petId: PET,
  employeeId: LUIS,
  startsAt: SLOT_10AM.toISOString(),
};

const VALID_REQUEST_BODY = {
  serviceId: SERVICE,
  petId: PET,
  startsAt: SLOT_10AM.toISOString(),
};

function withoutField(body: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...body };
  delete copy[field];
  return copy;
}

// Autenticación de prueba: el header "Bearer <tipo>" decide el principal
const authenticate = async (authorization: string | null | undefined) => {
  if (!authorization) throw new AppError(401, 'MISSING_TOKEN', 'Falta el header Authorization');
  if (authorization === 'Bearer clinica') return clinicPrincipal(VET);
  if (authorization === 'Bearer dueno') return ownerPrincipal();
  throw new AppError(401, 'INVALID_TOKEN', 'Token inválido');
};

describe('parseClinicBody', () => {
  it('acepta un cuerpo válido y convierte startsAt en Date', () => {
    const parsed = parseClinicBody({ ...VALID_CLINIC_BODY, notes: 'Vacuna anual' });
    expect(parsed.startsAt).toEqual(SLOT_10AM);
    expect(parsed.notes).toBe('Vacuna anual');
  });

  it('notes es opcional y queda en null', () => {
    expect(parseClinicBody(VALID_CLINIC_BODY).notes).toBeNull();
  });

  it.each([
    ['cuerpo que no es objeto', 'texto'],
    ['cuerpo nulo', null],
    ['arreglo', []],
  ])('rechaza %s con 400', (_label, body) => {
    expect(() => parseClinicBody(body)).toThrow(AppError);
    try {
      parseClinicBody(body);
    } catch (error) {
      expect((error as AppError).status).toBe(400);
    }
  });

  it('falta employeeId → 400 VALIDATION_ERROR', () => {
    expect(() => parseClinicBody(withoutField(VALID_CLINIC_BODY, 'employeeId'))).toThrow(
      expect.objectContaining({ status: 400, code: 'VALIDATION_ERROR' })
    );
  });

  it('startsAt que no es fecha → 400', () => {
    expect(() => parseClinicBody({ ...VALID_CLINIC_BODY, startsAt: 'mañana' })).toThrow(/startsAt/);
  });

  it('startsAt que no es texto → 400', () => {
    expect(() => parseClinicBody({ ...VALID_CLINIC_BODY, startsAt: 1234 })).toThrow(/startsAt/);
  });

  it('notes de más de 1000 caracteres → 400', () => {
    expect(() => parseClinicBody({ ...VALID_CLINIC_BODY, notes: 'x'.repeat(1001) })).toThrow(/notes/);
  });

  it('notes que no es texto → 400', () => {
    expect(() => parseClinicBody({ ...VALID_CLINIC_BODY, notes: 5 })).toThrow(/notes/);
  });
});

describe('parseRequestBody', () => {
  it('no exige employeeId (el sistema asigna el veterinario)', () => {
    expect(parseRequestBody(VALID_REQUEST_BODY)).toMatchObject({ serviceId: SERVICE, petId: PET });
  });

  it('falta petId → 400', () => {
    expect(() => parseRequestBody(withoutField(VALID_REQUEST_BODY, 'petId'))).toThrow(/petId/);
  });
});

describe('handleCreateClinicAppointment', () => {
  const req = (authorization: string | undefined, body: unknown = VALID_CLINIC_BODY) => ({
    authorization,
    veterinaryId: VET,
    body,
    now: NOW,
  });

  it('201 con la cita confirmada en formato JSON (fechas ISO)', async () => {
    const deps = makeDeps();
    const result = await handleCreateClinicAppointment(req('Bearer clinica'), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(deps),
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      veterinaryId: VET,
      employeeId: LUIS,
      status: 'CONFIRMED',
      origin: 'CLINIC',
      serviceName: 'Consulta general',
      durationMinutes: 30,
      startsAt: '2026-12-07T15:00:00.000Z',
      endsAt: '2026-12-07T15:30:00.000Z',
    });
  });

  it('sin token → 401 MISSING_TOKEN con formato de error común', async () => {
    const result = await handleCreateClinicAppointment(req(undefined), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(makeDeps()),
    });

    expect(result.status).toBe(401);
    expect(result.body).toMatchObject({
      status: 401,
      error: 'Unauthorized',
      code: 'MISSING_TOKEN',
      timestamp: NOW.toISOString(),
    });
  });

  it('token de dueño → 403 CLINIC_TOKEN_REQUIRED', async () => {
    const result = await handleCreateClinicAppointment(req('Bearer dueno'), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(makeDeps()),
    });
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('CLINIC_TOKEN_REQUIRED');
  });

  it('cuerpo inválido → 400 sin llamar al caso de uso', async () => {
    const deps = makeDeps();
    const result = await handleCreateClinicAppointment(req('Bearer clinica', { serviceId: SERVICE }), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(deps),
    });
    expect(result.status).toBe(400);
    expect(deps.appointments.rows).toHaveLength(0);
  });

  it('franja ocupada → 409 SLOT_UNAVAILABLE', async () => {
    const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
    const result = await handleCreateClinicAppointment(req('Bearer clinica'), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(makeDeps({ repo })),
    });
    expect(result.status).toBe(409);
    expect((result.body as { code: string }).code).toBe('SLOT_UNAVAILABLE');
  });

  it('error inesperado → 500 sin filtrar el mensaje interno', async () => {
    const deps = makeDeps();
    deps.appointments.insert = async () => {
      throw new Error('secreto de la base');
    };
    const result = await handleCreateClinicAppointment(req('Bearer clinica'), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(deps),
    });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('secreto');
  });

  it('usa el empleado de Sara si Luis está ocupado (la clínica elige explícitamente)', async () => {
    const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
    const result = await handleCreateClinicAppointment(req('Bearer clinica', { ...VALID_CLINIC_BODY, employeeId: SARA }), {
      authenticate,
      useCase: new CreateClinicAppointmentUseCase(makeDeps({ repo })),
    });
    expect(result.status).toBe(201);
    expect((result.body as { employeeId: string }).employeeId).toBe(SARA);
  });
});

describe('handleRequestAppointment', () => {
  const req = (authorization: string | undefined, body: unknown = VALID_REQUEST_BODY) => ({
    authorization,
    veterinaryId: VET,
    body,
    now: NOW,
  });

  it('201 con la solicitud en REQUESTED cuando la clínica confirma las reservas', async () => {
    const result = await handleRequestAppointment(req('Bearer dueno'), {
      authenticate,
      useCase: new RequestAppointmentUseCase(makeDeps({ config: { bookingRequiresConfirmation: true } })),
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ status: 'REQUESTED', origin: 'APP', ownerUserId: 'owner-1' });
  });

  it('token de clínica → 403 OWNER_TOKEN_REQUIRED', async () => {
    const result = await handleRequestAppointment(req('Bearer clinica'), {
      authenticate,
      useCase: new RequestAppointmentUseCase(makeDeps()),
    });
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('OWNER_TOKEN_REQUIRED');
  });

  it('sin token → 401', async () => {
    const result = await handleRequestAppointment(req(undefined), {
      authenticate,
      useCase: new RequestAppointmentUseCase(makeDeps()),
    });
    expect(result.status).toBe(401);
  });

  it('mascota no compartida → 403 PET_NOT_SHARED', async () => {
    const result = await handleRequestAppointment(req('Bearer dueno'), {
      authenticate,
      useCase: new RequestAppointmentUseCase(makeDeps({ petShared: false })),
    });
    expect(result.status).toBe(403);
    expect((result.body as { code: string }).code).toBe('PET_NOT_SHARED');
  });
});
