import { AppError } from '@/domain/errors/AppError';
import { assertResourceBelongsTo, assertSameVeterinary } from '../tenant';

describe('assertSameVeterinary (vet_id del token vs. ruta)', () => {
  it('misma clínica → no lanza', () => {
    expect(() => assertSameVeterinary('vet-1', 'vet-1')).not.toThrow();
  });

  it('clínica distinta → 403 TENANT_MISMATCH', () => {
    expect(() => assertSameVeterinary('vet-1', 'vet-2')).toThrow(AppError);
    try {
      assertSameVeterinary('vet-1', 'vet-2');
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: 'TENANT_MISMATCH' });
    }
  });
});

describe('assertResourceBelongsTo (recurso de otra clínica)', () => {
  it('recurso de la misma clínica → no lanza', () => {
    expect(() => assertResourceBelongsTo('vet-1', 'vet-1')).not.toThrow();
  });

  it('recurso de otra clínica → 404 NOT_FOUND (no revela que existe)', () => {
    try {
      assertResourceBelongsTo('vet-2', 'vet-1');
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
  });
});
