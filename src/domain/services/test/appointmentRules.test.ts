import { noShowAllowedAt, ownerCanCancelAt } from '../appointmentRules';

const START = new Date('2026-12-07T15:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('ownerCanCancelAt (plazo del dueño)', () => {
  it('exactamente en el límite de cancellationMinHours sí se permite', () => {
    expect(ownerCanCancelAt(START, new Date(START.getTime() - 24 * HOUR), 24)).toBe(true);
  });

  it('un minuto antes del límite ya no se permite', () => {
    expect(ownerCanCancelAt(START, new Date(START.getTime() - 24 * HOUR + 60_000), 24)).toBe(false);
  });

  it('con 0 horas de plazo se permite hasta el inicio mismo', () => {
    expect(ownerCanCancelAt(START, START, 0)).toBe(true);
  });

  it('una cita que ya empezó no se puede cancelar con plazo positivo', () => {
    expect(ownerCanCancelAt(START, new Date(START.getTime() + HOUR), 1)).toBe(false);
  });
});

describe('noShowAllowedAt (no asistió solo después del inicio)', () => {
  it('antes del inicio → no', () => {
    expect(noShowAllowedAt(START, new Date(START.getTime() - 1))).toBe(false);
  });

  it('en el instante exacto del inicio → sí', () => {
    expect(noShowAllowedAt(START, START)).toBe(true);
  });

  it('después del inicio → sí', () => {
    expect(noShowAllowedAt(START, new Date(START.getTime() + HOUR))).toBe(true);
  });
});
