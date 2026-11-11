import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppError } from '@/domain/errors/AppError';
import { Principal } from '@/domain/entities/Principal';
import { CreateClinicAppointmentUseCase } from '@/application/use-cases/CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '@/application/use-cases/RequestAppointmentUseCase';
import { toErrorResponse } from './errorBody';

// Handlers HTTP sin dependencia de Next: reciben lo que llega y devuelven { status, body }.
// Las rutas en app/api/** solo los llaman.

export interface HttpResult {
  status: number;
  body: unknown;
}

export interface HandlerRequest {
  authorization: string | null | undefined;
  veterinaryId: string;
  body: unknown;
  now: Date;
}

const MAX_NOTES_LENGTH = 1000;

function invalid(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

function requireObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('El cuerpo de la petición debe ser un objeto JSON');
  }
  return body as Record<string, unknown>;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`El campo ${field} es obligatorio`);
  }
  return value;
}

function parseStartsAt(value: unknown): Date {
  if (typeof value !== 'string') {
    throw invalid('El campo startsAt debe ser una fecha ISO-8601');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw invalid('El campo startsAt no es una fecha válida');
  }
  return date;
}

function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalid('El campo notes debe ser texto');
  }
  if (value.length > MAX_NOTES_LENGTH) {
    throw invalid(`El campo notes no puede superar ${MAX_NOTES_LENGTH} caracteres`);
  }
  return value;
}

export function parseClinicBody(body: unknown) {
  const b = requireObject(body);
  return {
    serviceId: requireId(b.serviceId, 'serviceId'),
    petId: requireId(b.petId, 'petId'),
    employeeId: requireId(b.employeeId, 'employeeId'),
    startsAt: parseStartsAt(b.startsAt),
    notes: parseNotes(b.notes),
  };
}

export function parseRequestBody(body: unknown) {
  const b = requireObject(body);
  return {
    serviceId: requireId(b.serviceId, 'serviceId'),
    petId: requireId(b.petId, 'petId'),
    startsAt: parseStartsAt(b.startsAt),
    notes: parseNotes(b.notes),
  };
}

// Forma JSON de la cita en las respuestas (camelCase, fechas ISO UTC).
export function toAppointmentResponse(record: AppointmentRecord) {
  return {
    id: record.id,
    veterinaryId: record.veterinaryId,
    employeeId: record.employeeId,
    petId: record.petId,
    ownerUserId: record.ownerUserId,
    serviceId: record.serviceId,
    serviceName: record.serviceName,
    durationMinutes: record.durationMinutes,
    price: record.price,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    status: record.status,
    origin: record.origin,
    notes: record.notes,
    createdBy: record.createdBy,
  };
}

interface Deps<U> {
  authenticate: (authorization: string | null | undefined) => Promise<Principal>;
  useCase: U;
}

// POST /api/veterinaries/{veterinaryId}/appointments (clínica) → 201
export async function handleCreateClinicAppointment(
  req: HandlerRequest,
  deps: Deps<CreateClinicAppointmentUseCase>
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const input = parseClinicBody(req.body);
    const record = await deps.useCase.execute(principal, { veterinaryId: req.veterinaryId, ...input });
    return { status: 201, body: toAppointmentResponse(record) };
  } catch (error) {
    const { status, body } = toErrorResponse(error, req.now);
    return { status, body };
  }
}

// POST /api/veterinaries/{veterinaryId}/appointment-requests (dueño) → 201
export async function handleRequestAppointment(
  req: HandlerRequest,
  deps: Deps<RequestAppointmentUseCase>
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const input = parseRequestBody(req.body);
    const record = await deps.useCase.execute(principal, { veterinaryId: req.veterinaryId, ...input });
    return { status: 201, body: toAppointmentResponse(record) };
  } catch (error) {
    const { status, body } = toErrorResponse(error, req.now);
    return { status, body };
  }
}
