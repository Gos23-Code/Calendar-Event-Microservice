import {
  ActiveAppointment,
  AvailabilityInputError,
  AvailabilityQuery,
  computeAvailability,
  ScheduleRules,
} from '../availability';

// 2026-12-07 es lunes. Clínica en Bogotá (UTC-5): 08:00 local = 13:00 UTC.
const MONDAY = '2026-12-07';
const SUNDAY = '2026-12-06';
const MON = 1;

const rules = (overrides: Partial<ScheduleRules> = {}): ScheduleRules => ({
  timezone: 'America/Bogota',
  businessHours: [
    { weekday: 1, open: '08:00', close: '12:00' },
    { weekday: 2, open: '08:00', close: '12:00' },
    { weekday: 3, open: '08:00', close: '12:00' },
    { weekday: 4, open: '08:00', close: '12:00' },
    { weekday: 5, open: '08:00', close: '12:00' },
  ],
  employees: [
    {
      employeeId: 'E1',
      employeeName: 'Dr. Luis',
      hours: [{ weekday: MON, open: '08:00', close: '12:00' }],
    },
  ],
  blocks: [],
  ...overrides,
});

const query = (overrides: Partial<AvailabilityQuery> = {}): AvailabilityQuery => ({
  date: MONDAY,
  durationMinutes: 30,
  now: new Date('2026-12-01T00:00:00.000Z'),
  minLeadMinutes: 0,
  ...overrides,
});

const iso = (slots: { startsAt: Date }[]) => slots.map((s) => s.startsAt.toISOString());

describe('computeAvailability', () => {
  describe('horario', () => {
    it('genera franjas de la duración pedida dentro del horario de la clínica (en su zona)', () => {
      const slots = computeAvailability(query(), rules(), []);

      expect(slots).toHaveLength(8); // 08:00 a 12:00 en bloques de 30 min
      expect(slots[0].startsAt.toISOString()).toBe('2026-12-07T13:00:00.000Z'); // 08:00 Bogotá
      expect(slots[7].startsAt.toISOString()).toBe('2026-12-07T16:30:00.000Z'); // 11:30 Bogotá
      expect(slots[7].endsAt.toISOString()).toBe('2026-12-07T17:00:00.000Z'); // 12:00 Bogotá
    });

    it('no genera una franja que no cabe completa antes del cierre', () => {
      const slots = computeAvailability(query({ durationMinutes: 90 }), rules(), []);

      // 08:00-09:30, 09:30-11:00. La de 11:00-12:30 se pasa del cierre.
      expect(slots).toHaveLength(2);
      expect(slots[1].endsAt.toISOString()).toBe('2026-12-07T16:00:00.000Z'); // 11:00 Bogotá
    });

    it('un día sin horario de clínica no tiene franjas', () => {
      expect(computeAvailability(query({ date: SUNDAY }), rules(), [])).toEqual([]);
    });

    it('usa la intersección entre horario de la clínica y del empleado', () => {
      const r = rules({
        employees: [
          {
            employeeId: 'E1',
            employeeName: 'Dr. Luis',
            hours: [{ weekday: MON, open: '10:00', close: '11:00' }],
          },
        ],
      });

      const slots = computeAvailability(query(), r, []);

      expect(iso(slots)).toEqual(['2026-12-07T15:00:00.000Z', '2026-12-07T15:30:00.000Z']); // 10:00 y 10:30
    });

    it('un empleado sin horario ese día no tiene franjas', () => {
      const r = rules({
        employees: [{ employeeId: 'E1', employeeName: 'Dr. Luis', hours: [] }],
      });
      expect(computeAvailability(query(), r, [])).toEqual([]);
    });
  });

  describe('bloqueos', () => {
    it('un bloqueo de la clínica quita las franjas que se solapan', () => {
      const r = rules({
        blocks: [
          {
            startsAt: new Date('2026-12-07T14:00:00.000Z'), // 09:00 Bogotá
            endsAt: new Date('2026-12-07T15:00:00.000Z'), // 10:00 Bogotá
            employeeId: null,
          },
        ],
      });

      const slots = computeAvailability(query(), r, []);

      expect(slots).toHaveLength(6);
      expect(iso(slots)).not.toContain('2026-12-07T14:00:00.000Z');
      expect(iso(slots)).not.toContain('2026-12-07T14:30:00.000Z');
    });

    it('un bloqueo de un empleado solo afecta a ese empleado', () => {
      const r = rules({
        employees: [
          { employeeId: 'E1', employeeName: 'Dr. Luis', hours: [{ weekday: MON, open: '08:00', close: '12:00' }] },
          { employeeId: 'E2', employeeName: 'Dra. Sara', hours: [{ weekday: MON, open: '08:00', close: '12:00' }] },
        ],
        blocks: [
          {
            startsAt: new Date('2026-12-07T14:00:00.000Z'),
            endsAt: new Date('2026-12-07T15:00:00.000Z'),
            employeeId: 'E2',
          },
        ],
      });

      const slots = computeAvailability(query(), r, []);

      const e1 = slots.filter((s) => s.employeeId === 'E1');
      const e2 = slots.filter((s) => s.employeeId === 'E2');
      expect(e1).toHaveLength(8);
      expect(e2).toHaveLength(6);
    });
  });

  describe('citas activas', () => {
    it('una cita activa del empleado quita la franja que ocupa', () => {
      const appointments: ActiveAppointment[] = [
        {
          employeeId: 'E1',
          startsAt: new Date('2026-12-07T15:00:00.000Z'), // 10:00 Bogotá
          endsAt: new Date('2026-12-07T15:30:00.000Z'),
        },
      ];

      const slots = computeAvailability(query(), rules(), appointments);

      expect(slots).toHaveLength(7);
      expect(iso(slots)).not.toContain('2026-12-07T15:00:00.000Z');
    });

    it('una cita de otro empleado no afecta al empleado actual', () => {
      const appointments: ActiveAppointment[] = [
        {
          employeeId: 'E2',
          startsAt: new Date('2026-12-07T15:00:00.000Z'),
          endsAt: new Date('2026-12-07T15:30:00.000Z'),
        },
      ];

      expect(computeAvailability(query(), rules(), appointments)).toHaveLength(8);
    });

    it('una franja contigua a una cita sigue disponible', () => {
      const appointments: ActiveAppointment[] = [
        {
          employeeId: 'E1',
          startsAt: new Date('2026-12-07T15:00:00.000Z'), // 10:00
          endsAt: new Date('2026-12-07T15:30:00.000Z'), // 10:30
        },
      ];

      const slots = computeAvailability(query(), rules(), appointments);

      expect(iso(slots)).toContain('2026-12-07T15:30:00.000Z'); // 10:30 queda libre
    });
  });

  describe('pasado y anticipación', () => {
    it('no ofrece franjas en el pasado', () => {
      const slots = computeAvailability(
        query({ now: new Date('2026-12-07T20:00:00.000Z') }), // 15:00 Bogotá, ya cerró
        rules(),
        []
      );
      expect(slots).toEqual([]);
    });

    it('con 60 min de anticipación no ofrece franjas antes de now + 1 h', () => {
      // now = 08:30 Bogotá. Con 60 min de anticipación, la primera franja es 09:30.
      const slots = computeAvailability(
        query({ now: new Date('2026-12-07T13:30:00.000Z'), minLeadMinutes: 60 }),
        rules(),
        []
      );

      expect(slots).toHaveLength(5); // 09:30, 10:00, 10:30, 11:00, 11:30
      expect(slots[0].startsAt.toISOString()).toBe('2026-12-07T14:30:00.000Z');
    });

    it('sin anticipación la franja que empieza justo ahora sí se ofrece', () => {
      const slots = computeAvailability(
        query({ now: new Date('2026-12-07T13:00:00.000Z') }), // exactamente 08:00 Bogotá
        rules(),
        []
      );
      expect(slots[0].startsAt.toISOString()).toBe('2026-12-07T13:00:00.000Z');
    });
  });

  describe('filtros y orden', () => {
    it('filtra por empleado cuando se pasa employeeId', () => {
      const r = rules({
        employees: [
          { employeeId: 'E1', employeeName: 'Dr. Luis', hours: [{ weekday: MON, open: '08:00', close: '12:00' }] },
          { employeeId: 'E2', employeeName: 'Dra. Sara', hours: [{ weekday: MON, open: '08:00', close: '12:00' }] },
        ],
      });

      const slots = computeAvailability(query({ employeeId: 'E2' }), r, []);

      expect(slots.every((s) => s.employeeId === 'E2')).toBe(true);
      expect(slots[0].employeeName).toBe('Dra. Sara');
    });

    it('devuelve las franjas ordenadas por hora y luego por empleado', () => {
      const r = rules({
        employees: [
          { employeeId: 'E2', employeeName: 'Dra. Sara', hours: [{ weekday: MON, open: '08:00', close: '09:00' }] },
          { employeeId: 'E1', employeeName: 'Dr. Luis', hours: [{ weekday: MON, open: '08:00', close: '09:00' }] },
        ],
      });

      const slots = computeAvailability(query(), r, []);

      expect(slots.map((s) => s.employeeId)).toEqual(['E1', 'E2', 'E1', 'E2']);
    });
  });

  describe('validación de entrada', () => {
    it.each([0, -30, 12.5])('rechaza durationMinutes = %p', (duration) => {
      expect(() => computeAvailability(query({ durationMinutes: duration }), rules(), [])).toThrow(
        AvailabilityInputError
      );
    });

    it.each(['2026-13-01', '2026-02-30', '07-12-2026', 'hoy'])('rechaza la fecha %p', (date) => {
      expect(() => computeAvailability(query({ date }), rules(), [])).toThrow(AvailabilityInputError);
    });

    it('rechaza un horario que cierra antes de abrir', () => {
      const r = rules({ businessHours: [{ weekday: MON, open: '12:00', close: '08:00' }] });
      expect(() => computeAvailability(query(), r, [])).toThrow(/Rango horario inválido/);
    });
  });
});
