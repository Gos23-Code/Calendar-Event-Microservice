import { AppError } from '@/domain/errors/AppError';

export const MAX_RANGE_DAYS = 31;
const DAY_MS = 24 * 60 * 60 * 1000;

// Rango de consulta [from, to): to debe ser posterior a from y el rango no puede pasar de 31 días.
export function assertRange(from: Date, to: Date): void {
  if (to.getTime() <= from.getTime()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'El campo "to" debe ser posterior a "from"');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new AppError(400, 'VALIDATION_ERROR', `El rango no puede superar ${MAX_RANGE_DAYS} días`);
  }
}
