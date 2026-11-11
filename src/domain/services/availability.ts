import { zonedDateTimeToUtc } from '@/shared/utils/zonedTime';

// Cálculo de disponibilidad (CAL-04). Lógica pura: los datos de la clínica
// (horarios, bloqueos, citas activas) llegan como parámetros.
// Horas "HH:mm" y fechas "YYYY-MM-DD" se interpretan en la zona horaria de la clínica.

export interface DailyHours {
  weekday: number; // 0 = domingo ... 6 = sábado
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

export interface EmployeeSchedule {
  employeeId: string;
  employeeName: string;
  hours: DailyHours[]; // si no hay entrada para un día, el empleado no trabaja ese día
}

export interface ScheduleBlock {
  startsAt: Date;
  endsAt: Date;
  employeeId: string | null; // null = bloquea a toda la clínica
}

export interface ScheduleRules {
  timezone: string;
  businessHours: DailyHours[];
  employees: EmployeeSchedule[];
  blocks: ScheduleBlock[];
}

export interface ActiveAppointment {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityQuery {
  date: string; // "YYYY-MM-DD" en la zona de la clínica
  durationMinutes: number;
  now: Date;
  minLeadMinutes: number; // 60 para reservas desde la app, 0 para la clínica
  employeeId?: string;
}

export interface AvailabilitySlot {
  startsAt: Date;
  endsAt: Date;
  employeeId: string;
  employeeName: string;
}

export class AvailabilityInputError extends Error {
  readonly code = 'AVAILABILITY_INVALID_INPUT';

  constructor(message: string) {
    super(message);
    this.name = 'AvailabilityInputError';
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface TimeRange {
  startMs: number;
  endMs: number;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_RE.exec(date);
  if (!match) {
    throw new AvailabilityInputError(`Fecha inválida: ${date}`);
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new AvailabilityInputError(`Fecha inexistente: ${date}`);
  }
  return { year, month, day };
}

function parseTime(time: string): { hour: number; minute: number } {
  const match = TIME_RE.exec(time);
  if (!match) {
    throw new AvailabilityInputError(`Hora inválida: ${time}`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

// Ventana UTC de un rango "HH:mm"-"HH:mm" en un día concreto de la zona.
function windowFor(
  day: { year: number; month: number; day: number },
  open: string,
  close: string,
  timeZone: string
): TimeRange {
  const o = parseTime(open);
  const c = parseTime(close);
  const startMs = zonedDateTimeToUtc(day.year, day.month, day.day, o.hour, o.minute, timeZone).getTime();
  const endMs = zonedDateTimeToUtc(day.year, day.month, day.day, c.hour, c.minute, timeZone).getTime();
  if (endMs <= startMs) {
    throw new AvailabilityInputError(`Rango horario inválido: ${open}-${close}`);
  }
  return { startMs, endMs };
}

function intersect(a: TimeRange, b: TimeRange): TimeRange | null {
  const startMs = Math.max(a.startMs, b.startMs);
  const endMs = Math.min(a.endMs, b.endMs);
  return endMs > startMs ? { startMs, endMs } : null;
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function computeAvailability(
  query: AvailabilityQuery,
  rules: ScheduleRules,
  appointments: ActiveAppointment[]
): AvailabilitySlot[] {
  if (!Number.isInteger(query.durationMinutes) || query.durationMinutes <= 0) {
    throw new AvailabilityInputError('durationMinutes debe ser un entero positivo');
  }

  const day = parseDate(query.date);
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();

  const clinicToday = rules.businessHours.find((h) => h.weekday === weekday);
  if (!clinicToday) {
    return [];
  }
  const clinicTimeRange = windowFor(day, clinicToday.open, clinicToday.close, rules.timezone);

  const minStartMs = query.now.getTime() + query.minLeadMinutes * 60_000;
  const durationMs = query.durationMinutes * 60_000;

  const employees = rules.employees.filter(
    (e) => query.employeeId === undefined || e.employeeId === query.employeeId
  );

  const slots: AvailabilitySlot[] = [];

  for (const employee of employees) {
    const employeeToday = employee.hours.find((h) => h.weekday === weekday);
    if (!employeeToday) {
      continue;
    }

    const employeeTimeRange = windowFor(day, employeeToday.open, employeeToday.close, rules.timezone);
    const window = intersect(clinicTimeRange, employeeTimeRange);
    if (!window) {
      continue;
    }

    const employeeBlocks = rules.blocks.filter(
      (b) => b.employeeId === null || b.employeeId === employee.employeeId
    );
    const employeeAppointments = appointments.filter((a) => a.employeeId === employee.employeeId);

    for (let start = window.startMs; start + durationMs <= window.endMs; start += durationMs) {
      const end = start + durationMs;

      if (start < minStartMs) {
        continue;
      }

      const blocked = employeeBlocks.some((b) =>
        overlaps(start, end, b.startsAt.getTime(), b.endsAt.getTime())
      );
      if (blocked) {
        continue;
      }

      const taken = employeeAppointments.some((a) =>
        overlaps(start, end, a.startsAt.getTime(), a.endsAt.getTime())
      );
      if (taken) {
        continue;
      }

      slots.push({
        startsAt: new Date(start),
        endsAt: new Date(end),
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
      });
    }
  }

  return slots.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.employeeId.localeCompare(b.employeeId)
  );
}
