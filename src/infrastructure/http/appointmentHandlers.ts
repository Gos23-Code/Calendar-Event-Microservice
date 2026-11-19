import { AppointmentRecord } from '@/domain/entities/Appointment';
import { Principal } from '@/domain/entities/Principal';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppError } from '@/domain/errors/AppError';
import { CreateClinicAppointmentUseCase } from '@/application/use-cases/CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '@/application/use-cases/RequestAppointmentUseCase';
import { AppointmentLifecycleUseCase } from '@/application/use-cases/AppointmentLifecycleUseCase';
import {
  ClinicAgendaUseCase,
  OwnerAppointmentsUseCase,
} from '@/application/use-cases/AppointmentQueriesUseCase';
import { SendAppointmentRemindersUseCase } from '@/application/use-cases/SendAppointmentRemindersUseCase';
import { IPetDirectory } from '@/domain/interfaces/IPetDirectory';
import { isValidInternalApiKey } from '../auth/internalApiKey';
import { toErrorResponse } from './errorBody';

// Handlers HTTP sin dependencia de Next: reciben lo que llega y devuelven { status, body }.
// Las rutas en app/api/** solo los llaman.

export interface HttpResult {
  status: number;
  body: unknown;
}

type Authenticate = (authorization: string | null | undefined) => Promise<Principal>;

const MAX_NOTES_LENGTH = 1000;
const MAX_REASON_LENGTH = 500;

export const APPOINTMENT_ACTIONS = ['confirm', 'reject', 'cancel', 'check-in', 'complete', 'no-show', 'reschedule'] as const;
export type AppointmentAction = (typeof APPOINTMENT_ACTIONS)[number];

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

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw invalid(`El campo ${field} debe ser una fecha ISO-8601`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw invalid(`El campo ${field} no es una fecha válida`);
  }
  return date;
}

function parseOptionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw invalid(`El campo ${field} debe ser texto`);
  }
  if (value.length > max) {
    throw invalid(`El campo ${field} no puede superar ${max} caracteres`);
  }
  return value;
}

// --- cuerpos de creación ---

export function parseClinicBody(body: unknown) {
  const b = requireObject(body);
  return {
    serviceId: requireId(b.serviceId, 'serviceId'),
    petId: requireId(b.petId, 'petId'),
    employeeId: requireId(b.employeeId, 'employeeId'),
    startsAt: parseDate(b.startsAt, 'startsAt'),
    notes: parseOptionalText(b.notes, 'notes', MAX_NOTES_LENGTH),
  };
}

export function parseRequestBody(body: unknown) {
  const b = requireObject(body);
  return {
    serviceId: requireId(b.serviceId, 'serviceId'),
    petId: requireId(b.petId, 'petId'),
    startsAt: parseDate(b.startsAt, 'startsAt'),
    notes: parseOptionalText(b.notes, 'notes', MAX_NOTES_LENGTH),
  };
}

// --- cuerpos de cada acción ---

// Devuelve el argumento que necesita cada acción del ciclo de vida.
export function parseActionBody(action: AppointmentAction, body: unknown): { reason?: string; startsAt?: Date } {
  switch (action) {
    case 'confirm':
    case 'check-in':
    case 'complete':
    case 'no-show':
      return {};
    case 'reject': {
      const b = requireObject(body);
      if (typeof b.reason !== 'string') {
        throw invalid('El campo reason (motivo) es obligatorio');
      }
      return { reason: b.reason };
    }
    case 'cancel': {
      // El cuerpo es opcional: sin cuerpo, la cancelación no tiene motivo
      if (body === undefined || body === null) return {};
      const b = requireObject(body);
      const reason = parseOptionalText(b.reason, 'reason', MAX_REASON_LENGTH);
      return reason === null ? {} : { reason };
    }
    case 'reschedule': {
      const b = requireObject(body);
      return { startsAt: parseDate(b.startsAt, 'startsAt') };
    }
  }
}

// --- consultas ---

// Parámetros de la agenda: from y to obligatorios; employeeId y status opcionales (status puede ser lista separada por comas).
export function parseAgendaQuery(params: URLSearchParams) {
  const from = parseDate(params.get('from'), 'from');
  const to = parseDate(params.get('to'), 'to');

  const employeeId = params.get('employeeId') ?? undefined;

  const statusParam = params.get('status');
  let statuses: AppointmentStatus[] | undefined;
  if (statusParam !== null && statusParam !== '') {
    const valid = new Set<string>(Object.values(AppointmentStatus));
    const requested = statusParam.split(',').map((s) => s.trim());
    const unknown = requested.filter((s) => !valid.has(s));
    if (unknown.length > 0) {
      throw invalid(`Estado desconocido: ${unknown.join(', ')}`);
    }
    statuses = requested as AppointmentStatus[];
  }

  return { from, to, employeeId, statuses };
}

// --- formato de respuesta ---

// Forma JSON de la cita en las respuestas (camelCase, fechas ISO UTC).
export function toAppointmentResponse(record: AppointmentRecord, petName: string | null = null) {
  return {
    id: record.id,
    veterinaryId: record.veterinaryId,
    employeeId: record.employeeId,
    petId: record.petId,
    petName,
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
    cancellationReason: record.cancellationReason,
    cancelledBy: record.cancelledBy,
    createdBy: record.createdBy,
  };
}

// Nombres de las mascotas de un conjunto de citas, en una sola llamada a Pets.
// Si Pets no responde, el error (503) sube y la respuesta completa falla, como se acordó.
async function petNamesFor(pets: IPetDirectory | undefined, records: AppointmentRecord[]): Promise<Map<string, string>> {
  if (!pets || records.length === 0) return new Map();
  const found = await pets.getPets(records.map((r) => r.petId));
  return new Map([...found].map(([id, pet]) => [id, pet.name]));
}

// Una cita con el nombre de su mascota (usado por creación y por acciones PATCH).
async function withPetName(record: AppointmentRecord, pets: IPetDirectory | undefined) {
  const names = await petNamesFor(pets, [record]);
  return toAppointmentResponse(record, names.get(record.petId) ?? null);
}

// --- handlers ---

export interface HandlerRequest {
  authorization: string | null | undefined;
  veterinaryId: string;
  body: unknown;
  now: Date;
}

// POST /api/veterinaries/{veterinaryId}/appointments (clínica) → 201
export async function handleCreateClinicAppointment(
  req: HandlerRequest,
  deps: { authenticate: Authenticate; useCase: CreateClinicAppointmentUseCase; pets?: IPetDirectory }
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const input = parseClinicBody(req.body);
    const record = await deps.useCase.execute(principal, { veterinaryId: req.veterinaryId, ...input });
    return { status: 201, body: await withPetName(record, deps.pets) };
  } catch (error) {
    return failure(error, req.now);
  }
}

// POST /api/veterinaries/{veterinaryId}/appointment-requests (dueño) → 201
export async function handleRequestAppointment(
  req: HandlerRequest,
  deps: { authenticate: Authenticate; useCase: RequestAppointmentUseCase; pets?: IPetDirectory }
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const input = parseRequestBody(req.body);
    const record = await deps.useCase.execute(principal, { veterinaryId: req.veterinaryId, ...input });
    return { status: 201, body: await withPetName(record, deps.pets) };
  } catch (error) {
    return failure(error, req.now);
  }
}

export interface ActionRequest {
  authorization: string | null | undefined;
  veterinaryId: string;
  appointmentId: string;
  action: string;
  body: unknown;
  now: Date;
}

// PATCH /api/veterinaries/{veterinaryId}/appointments/{appointmentId}/{action} → 200
export async function handleAppointmentAction(
  req: ActionRequest,
  deps: { authenticate: Authenticate; lifecycle: AppointmentLifecycleUseCase; pets?: IPetDirectory }
): Promise<HttpResult> {
  try {
    if (!(APPOINTMENT_ACTIONS as readonly string[]).includes(req.action)) {
      throw new AppError(404, 'ACTION_NOT_FOUND', `Acción desconocida: ${req.action}`);
    }
    const action = req.action as AppointmentAction;

    const principal = await deps.authenticate(req.authorization);
    const args = parseActionBody(action, req.body);
    const id = requireId(req.appointmentId, 'appointmentId');
    const vet = req.veterinaryId;

    let record: AppointmentRecord;
    switch (action) {
      case 'confirm':
        record = await deps.lifecycle.confirm(principal, vet, id);
        break;
      case 'reject':
        record = await deps.lifecycle.reject(principal, vet, id, args.reason ?? '');
        break;
      case 'cancel':
        record = await deps.lifecycle.cancel(principal, vet, id, args.reason ?? null);
        break;
      case 'check-in':
        record = await deps.lifecycle.checkIn(principal, vet, id);
        break;
      case 'complete':
        record = await deps.lifecycle.complete(principal, vet, id);
        break;
      case 'no-show':
        record = await deps.lifecycle.noShow(principal, vet, id);
        break;
      case 'reschedule':
        record = await deps.lifecycle.reschedule(principal, vet, id, args.startsAt as Date);
        break;
    }
    return { status: 200, body: await withPetName(record, deps.pets) };
  } catch (error) {
    return failure(error, req.now);
  }
}

export interface AgendaRequest {
  authorization: string | null | undefined;
  veterinaryId: string;
  params: URLSearchParams;
  now: Date;
}

// GET /api/veterinaries/{veterinaryId}/appointments?from=&to=&employeeId=&status= → 200
export async function handleClinicAgenda(
  req: AgendaRequest,
  deps: { authenticate: Authenticate; agenda: ClinicAgendaUseCase; pets?: IPetDirectory }
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const filter = parseAgendaQuery(req.params);
    const records = await deps.agenda.list(principal, req.veterinaryId, filter);
    const names = await petNamesFor(deps.pets, records);
    return {
      status: 200,
      body: { appointments: records.map((r) => toAppointmentResponse(r, names.get(r.petId) ?? null)) },
    };
  } catch (error) {
    return failure(error, req.now);
  }
}

export interface OwnerListRequest {
  authorization: string | null | undefined;
  params: URLSearchParams;
  now: Date;
}

// GET /api/me/appointments?from=&to= → 200. Cada cita incluye el nombre de la clínica.
export async function handleOwnerAppointments(
  req: OwnerListRequest,
  deps: { authenticate: Authenticate; owner: OwnerAppointmentsUseCase; pets?: IPetDirectory }
): Promise<HttpResult> {
  try {
    const principal = await deps.authenticate(req.authorization);
    const from = parseDate(req.params.get('from'), 'from');
    const to = parseDate(req.params.get('to'), 'to');
    const views = await deps.owner.list(principal, from, to);
    const names = await petNamesFor(deps.pets, views.map((v) => v.appointment));
    return {
      status: 200,
      body: {
        appointments: views.map((v) => ({
          ...toAppointmentResponse(v.appointment, names.get(v.appointment.petId) ?? null),
          clinicName: v.clinicName,
        })),
      },
    };
  } catch (error) {
    return failure(error, req.now);
  }
}

export interface JobRequest {
  internalApiKey: string | null | undefined; // header X-Internal-Api-Key
  now: Date;
}

// POST /api/internal/jobs/appointments/reminders → 200. Solo lo llama el scheduler, con la clave interna.
export async function handleSendReminders(
  req: JobRequest,
  deps: { expectedKey: string; job: SendAppointmentRemindersUseCase }
): Promise<HttpResult> {
  try {
    if (!isValidInternalApiKey(req.internalApiKey, deps.expectedKey)) {
      throw new AppError(401, 'INVALID_INTERNAL_KEY', 'Clave interna inválida o ausente');
    }
    const result = await deps.job.run();
    return { status: 200, body: result };
  } catch (error) {
    return failure(error, req.now);
  }
}

function failure(error: unknown, now: Date): HttpResult {
  const { status, body } = toErrorResponse(error, now);
  return { status, body };
}
