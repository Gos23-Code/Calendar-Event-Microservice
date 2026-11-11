import { GetScheduleRulesQuery, IScheduleRulesProvider } from '@/domain/interfaces/IScheduleRulesProvider';
import { DailyHours, EmployeeSchedule, ScheduleBlock, ScheduleRules } from '@/domain/services/availability';
import { getZonedParts, zonedDateTimeToUtc } from '@/shared/utils/zonedTime';

// ⚠️ SIMULADO: reemplazar por el cliente real de Veterinary (Fase 5).
// Datos tomados de la pantalla de Agenda de Clínica Patitas.

export const SIMULATED_TIMEZONE = 'America/Bogota';

const MAX_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;

// Lunes a sábado
const WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const SIMULATED_EMPLOYEES: EmployeeSchedule[] = [
  {
    employeeId: 'aaaaaaaa-0000-4000-8000-000000000001',
    employeeName: 'Dr. Luis Pérez',
    hours: WORKING_WEEKDAYS.map((weekday) => ({ weekday, open: '08:00', close: '17:00' })),
  },
  {
    employeeId: 'bbbbbbbb-0000-4000-8000-000000000002',
    employeeName: 'Dra. Sara Ruiz',
    hours: WORKING_WEEKDAYS.map((weekday) => ({ weekday, open: '08:00', close: '17:00' })),
  },
  {
    // Peluquería: aparece en la agenda, pero su horario es de 9 a 5
    employeeId: 'cccccccc-0000-4000-8000-000000000003',
    employeeName: 'Camila Mora',
    hours: WORKING_WEEKDAYS.map((weekday) => ({ weekday, open: '09:00', close: '17:00' })),
  },
];

const SIMULATED_BUSINESS_HOURS: DailyHours[] = WORKING_WEEKDAYS.map((weekday) => ({
  weekday,
  open: '08:00',
  close: '17:00',
}));

export class ScheduleRulesRangeError extends Error {
  readonly code = 'SCHEDULE_RANGE_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ScheduleRulesRangeError';
  }
}

// Bloqueo de almuerzo 12:00-13:00 (hora de la clínica) para cada día del rango.
function lunchBlocks(from: Date, to: Date): ScheduleBlock[] {
  const start = getZonedParts(from, SIMULATED_TIMEZONE);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const blocks: ScheduleBlock[] = [];

  for (;;) {
    const day = new Date(cursor);
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();

    const startsAt = zonedDateTimeToUtc(y, m, d, 12, 0, SIMULATED_TIMEZONE);
    if (startsAt.getTime() >= to.getTime()) {
      break;
    }

    const endsAt = zonedDateTimeToUtc(y, m, d, 13, 0, SIMULATED_TIMEZONE);
    if (endsAt.getTime() > from.getTime()) {
      blocks.push({ startsAt, endsAt, employeeId: null });
    }

    cursor += DAY_MS;
  }

  return blocks;
}

export class SimulatedScheduleRulesProvider implements IScheduleRulesProvider {
  async getScheduleRules(query: GetScheduleRulesQuery): Promise<ScheduleRules> {
    const { from, to, employeeId } = query;

    if (to.getTime() <= from.getTime()) {
      throw new ScheduleRulesRangeError('El rango "to" debe ser posterior a "from"');
    }

    const days = (to.getTime() - from.getTime()) / DAY_MS;
    if (days > MAX_RANGE_DAYS) {
      throw new ScheduleRulesRangeError(`El rango no puede superar ${MAX_RANGE_DAYS} días`);
    }

    const employees = SIMULATED_EMPLOYEES.filter(
      (e) => employeeId === undefined || e.employeeId === employeeId
    );

    return {
      timezone: SIMULATED_TIMEZONE,
      businessHours: SIMULATED_BUSINESS_HOURS,
      employees,
      blocks: lunchBlocks(from, to),
    };
  }
}
