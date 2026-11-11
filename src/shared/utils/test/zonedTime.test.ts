import { getZonedParts, zonedDateTimeToUtc } from '../zonedTime';

describe('zonedDateTimeToUtc', () => {
  it('convierte hora de Bogotá (UTC-5, sin horario de verano) a UTC', () => {
    expect(zonedDateTimeToUtc(2026, 12, 7, 8, 0, 'America/Bogota').toISOString()).toBe(
      '2026-12-07T13:00:00.000Z'
    );
  });

  it('antes del cambio de horario de Nueva York la zona es UTC-5', () => {
    // 7 de marzo de 2026: EST (UTC-5)
    expect(zonedDateTimeToUtc(2026, 3, 7, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-03-07T14:00:00.000Z'
    );
  });

  it('después del cambio de horario de Nueva York la zona es UTC-4', () => {
    // 9 de marzo de 2026: EDT (UTC-4), el cambio fue el 8
    expect(zonedDateTimeToUtc(2026, 3, 9, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-03-09T13:00:00.000Z'
    );
  });

  it('getZonedParts devuelve la hora de pared de la zona', () => {
    const parts = getZonedParts(new Date('2026-12-07T13:00:00.000Z'), 'America/Bogota');
    expect(parts).toEqual({ year: 2026, month: 12, day: 7, hour: 8, minute: 0, second: 0 });
  });
});
