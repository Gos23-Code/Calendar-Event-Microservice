// Reglas de tiempo de las transiciones (CALENDAR_SERVICE_CHANGES.md, CAL-03).
// Funciones puras: reciben la hora actual para poder probarlas.

const HOUR_MS = 60 * 60 * 1000;

// El dueño solo cancela con al menos `minHours` de anticipación.
export function ownerCanCancelAt(startsAt: Date, now: Date, minHours: number): boolean {
  return startsAt.getTime() - now.getTime() >= minHours * HOUR_MS;
}

// NO_SHOW solo se registra después de que empieza la cita.
export function noShowAllowedAt(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime();
}
