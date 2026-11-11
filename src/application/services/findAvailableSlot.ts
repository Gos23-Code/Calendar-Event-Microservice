import { AppError } from '@/domain/errors/AppError';
import { IAppointmentRepository } from '@/domain/interfaces/IAppointmentRepository';
import { IScheduleRulesProvider } from '@/domain/interfaces/IScheduleRulesProvider';
import { AvailabilitySlot, computeAvailability } from '@/domain/services/availability';
import { getZonedParts } from '@/shared/utils/zonedTime';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SlotLookupDeps {
  rules: IScheduleRulesProvider;
  appointments: IAppointmentRepository;
}

export interface SlotLookupRequest {
  veterinaryId: string;
  startsAt: Date;
  durationMinutes: number;
  now: Date;
  minLeadMinutes: number;
  employeeId?: string;
  // Empleados que Veterinary declara elegibles para el servicio. Si no se pasa, no se filtra.
  eligibleEmployeeIds?: string[];
}

// Verifica que la franja pedida exista en la disponibilidad real y la devuelve.
// - employeeId inexistente en la clínica → 404 EMPLOYEE_NOT_FOUND
// - employeeId no elegible para el servicio → 409 EMPLOYEE_NOT_ELIGIBLE
// - franja fuera de la disponibilidad (horario, bloqueo, cita, pasado, anticipación) → 409 SLOT_UNAVAILABLE
export async function findAvailableSlot(
  deps: SlotLookupDeps,
  req: SlotLookupRequest
): Promise<AvailabilitySlot> {
  const from = new Date(req.startsAt.getTime() - DAY_MS);
  const to = new Date(req.startsAt.getTime() + DAY_MS);

  const rules = await deps.rules.getScheduleRules({
    veterinaryId: req.veterinaryId,
    from,
    to,
    employeeId: req.employeeId,
  });

  if (req.employeeId !== undefined && rules.employees.length === 0) {
    throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'El empleado no pertenece a esta clínica');
  }

  if (req.eligibleEmployeeIds !== undefined) {
    const eligible = new Set(req.eligibleEmployeeIds);

    if (req.employeeId !== undefined && !eligible.has(req.employeeId)) {
      throw new AppError(409, 'EMPLOYEE_NOT_ELIGIBLE', 'El empleado no puede prestar este servicio');
    }

    rules.employees = rules.employees.filter((e) => eligible.has(e.employeeId));
  }

  const active = await deps.appointments.findActive(req.veterinaryId, from, to);

  // La fecha se interpreta en la zona de la clínica, no en la del servidor.
  const local = getZonedParts(req.startsAt, rules.timezone);
  const date = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;

  const slots = computeAvailability(
    {
      date,
      durationMinutes: req.durationMinutes,
      now: req.now,
      minLeadMinutes: req.minLeadMinutes,
      employeeId: req.employeeId,
    },
    rules,
    active
  );

  const slot = slots.find((s) => s.startsAt.getTime() === req.startsAt.getTime());
  if (!slot) {
    throw new AppError(409, 'SLOT_UNAVAILABLE', 'La franja solicitada no está disponible');
  }

  return slot;
}
