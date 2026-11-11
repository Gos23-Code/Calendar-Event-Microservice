import { computeAvailability } from '@/domain/services/availability';
import {
  ScheduleRulesRangeError,
  SimulatedScheduleRulesProvider,
  SIMULATED_TIMEZONE,
} from '../SimulatedScheduleRulesProvider';

const provider = new SimulatedScheduleRulesProvider();

// 2026-12-07 (lunes) 00:00 en Bogotá = 05:00 UTC
const MON_FROM = new Date('2026-12-07T05:00:00.000Z');
const MON_TO = new Date('2026-12-08T05:00:00.000Z');

const LUIS = 'aaaaaaaa-0000-4000-8000-000000000001';
const SARA = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('SimulatedScheduleRulesProvider', () => {
  it('devuelve la zona horaria y el horario de la clínica', async () => {
    const rules = await provider.getScheduleRules({ veterinaryId: 'vet-1', from: MON_FROM, to: MON_TO });

    expect(rules.timezone).toBe(SIMULATED_TIMEZONE);
    expect(rules.businessHours).toHaveLength(6); // lunes a sábado
    expect(rules.businessHours.find((h) => h.weekday === 1)).toEqual({ weekday: 1, open: '08:00', close: '17:00' });
    expect(rules.businessHours.find((h) => h.weekday === 0)).toBeUndefined(); // domingo cerrado
  });

  it('devuelve los tres empleados de la agenda', async () => {
    const rules = await provider.getScheduleRules({ veterinaryId: 'vet-1', from: MON_FROM, to: MON_TO });
    expect(rules.employees.map((e) => e.employeeName)).toEqual(['Dr. Luis Pérez', 'Dra. Sara Ruiz', 'Camila Mora']);
  });

  it('filtra por employeeId', async () => {
    const rules = await provider.getScheduleRules({
      veterinaryId: 'vet-1',
      from: MON_FROM,
      to: MON_TO,
      employeeId: SARA,
    });
    expect(rules.employees).toHaveLength(1);
    expect(rules.employees[0].employeeId).toBe(SARA);
  });

  it('un employeeId desconocido devuelve lista vacía (la ruta responderá 404)', async () => {
    const rules = await provider.getScheduleRules({
      veterinaryId: 'vet-1',
      from: MON_FROM,
      to: MON_TO,
      employeeId: 'no-existe',
    });
    expect(rules.employees).toEqual([]);
  });

  it('genera un bloqueo de almuerzo 12:00-13:00 (hora de la clínica) por cada día del rango', async () => {
    const rules = await provider.getScheduleRules({
      veterinaryId: 'vet-1',
      from: MON_FROM,
      to: new Date('2026-12-10T05:00:00.000Z'), // 3 días: lun, mar, mié
    });

    expect(rules.blocks).toHaveLength(3);
    expect(rules.blocks[0].startsAt.toISOString()).toBe('2026-12-07T17:00:00.000Z'); // 12:00 Bogotá
    expect(rules.blocks[0].endsAt.toISOString()).toBe('2026-12-07T18:00:00.000Z'); // 13:00 Bogotá
    expect(rules.blocks.every((b) => b.employeeId === null)).toBe(true);
  });

  it('rechaza un rango en que "to" no es posterior a "from"', async () => {
    await expect(
      provider.getScheduleRules({ veterinaryId: 'vet-1', from: MON_TO, to: MON_FROM })
    ).rejects.toBeInstanceOf(ScheduleRulesRangeError);
  });

  it('acepta 62 días y rechaza 63', async () => {
    const from = MON_FROM;
    const plus = (days: number) => new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

    await expect(
      provider.getScheduleRules({ veterinaryId: 'vet-1', from, to: plus(62) })
    ).resolves.toBeDefined();

    await expect(
      provider.getScheduleRules({ veterinaryId: 'vet-1', from, to: plus(63) })
    ).rejects.toMatchObject({ code: 'SCHEDULE_RANGE_INVALID' });
  });

  describe('integración con el cálculo de disponibilidad', () => {
    it('un empleado tiene 16 franjas de 30 min en el día (9 h de horario menos el almuerzo)', async () => {
      const rules = await provider.getScheduleRules({
        veterinaryId: 'vet-1',
        from: MON_FROM,
        to: MON_TO,
        employeeId: LUIS,
      });

      const slots = computeAvailability(
        { date: '2026-12-07', durationMinutes: 30, now: new Date('2026-12-01T00:00:00.000Z'), minLeadMinutes: 0 },
        rules,
        []
      );

      expect(slots).toHaveLength(16);
      const startsAt = slots.map((s) => s.startsAt.toISOString());
      expect(startsAt).not.toContain('2026-12-07T17:00:00.000Z'); // 12:00 almuerzo
      expect(startsAt).not.toContain('2026-12-07T17:30:00.000Z'); // 12:30 almuerzo
      expect(startsAt).toContain('2026-12-07T16:30:00.000Z'); // 11:30 disponible
      expect(startsAt).toContain('2026-12-07T18:00:00.000Z'); // 13:00 disponible
    });

    it('todos los empleados juntos: Luis 16 + Sara 16 + Camila 14 (su horario empieza a las 9)', async () => {
      const rules = await provider.getScheduleRules({ veterinaryId: 'vet-1', from: MON_FROM, to: MON_TO });

      const slots = computeAvailability(
        { date: '2026-12-07', durationMinutes: 30, now: new Date('2026-12-01T00:00:00.000Z'), minLeadMinutes: 0 },
        rules,
        []
      );

      expect(slots).toHaveLength(46);
    });
  });
});
