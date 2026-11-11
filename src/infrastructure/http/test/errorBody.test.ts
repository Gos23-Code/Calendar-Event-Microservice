import { AppError } from '@/domain/errors/AppError';
import { toErrorResponse } from '../errorBody';

const NOW = new Date('2026-11-11T15:00:00.000Z');

describe('toErrorResponse', () => {
  it('AppError → formato común con timestamp, status, error, message y code', () => {
    const { status, body } = toErrorResponse(new AppError(409, 'SLOT_UNAVAILABLE', 'La franja no está disponible'), NOW);

    expect(status).toBe(409);
    expect(body).toEqual({
      timestamp: '2026-11-11T15:00:00.000Z',
      status: 409,
      error: 'Conflict',
      message: 'La franja no está disponible',
      code: 'SLOT_UNAVAILABLE',
    });
  });

  it.each([
    [403, 'Forbidden'],
    [404, 'Not Found'],
    [503, 'Service Unavailable'],
  ])('el estado %i usa la frase %s', (statusCode, phrase) => {
    const { body } = toErrorResponse(new AppError(statusCode as 403, 'X', 'm'), NOW);
    expect(body.error).toBe(phrase);
  });

  it('acepta errores con forma HTTP aunque no sean AppError (p. ej. UnauthorizedError de Fase 1)', () => {
    const error = Object.assign(new Error('firma inválida'), { status: 401, code: 'INVALID_TOKEN' });
    const { status, body } = toErrorResponse(error, NOW);

    expect(status).toBe(401);
    expect(body.code).toBe('INVALID_TOKEN');
    expect(body.error).toBe('Unauthorized');
  });

  it('error desconocido → 500 INTERNAL_ERROR sin filtrar el mensaje interno', () => {
    const { status, body } = toErrorResponse(new Error('password de la base: xyz'), NOW);

    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Error interno del servidor');
    expect(JSON.stringify(body)).not.toContain('xyz');
  });

  it('valores que no son error → 500 INTERNAL_ERROR', () => {
    expect(toErrorResponse('texto', NOW).status).toBe(500);
    expect(toErrorResponse(null, NOW).body.code).toBe('INTERNAL_ERROR');
  });
});
