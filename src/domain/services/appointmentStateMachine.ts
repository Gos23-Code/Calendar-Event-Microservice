import { AppointmentStatus as S } from '../enums/AppointmentStatus';

// Transiciones permitidas (CALENDAR_SERVICE_CHANGES.md, CAL-03).
// Las reglas de tiempo (plazo de cancelación, NO_SHOW solo después de starts_at)
// no viven aquí: dependen de la hora y de la configuración de la clínica, y se
// validan en los casos de uso de la Fase 3.
const TRANSITIONS: Record<S, readonly S[]> = {
  [S.REQUESTED]: [S.CONFIRMED, S.REJECTED, S.CANCELLED],
  [S.CONFIRMED]: [S.CHECKED_IN, S.NO_SHOW, S.CANCELLED],
  [S.CHECKED_IN]: [S.COMPLETED],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [],
  [S.NO_SHOW]: [],
  [S.REJECTED]: [],
};

export class InvalidAppointmentTransitionError extends Error {
  readonly code = 'APPOINTMENT_INVALID_TRANSITION';

  constructor(
    readonly from: S,
    readonly to: S
  ) {
    super(`Transición de cita no permitida: ${from} -> ${to}`);
    this.name = 'InvalidAppointmentTransitionError';
  }
}

export function canTransition(from: S, to: S): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: S, to: S): void {
  if (!canTransition(from, to)) {
    throw new InvalidAppointmentTransitionError(from, to);
  }
}

export function allowedTransitionsFrom(from: S): readonly S[] {
  return TRANSITIONS[from];
}
