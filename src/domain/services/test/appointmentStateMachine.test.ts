import { AppointmentStatus as S } from '@/domain/enums/AppointmentStatus';
import {
  allowedTransitionsFrom,
  assertTransition,
  canTransition,
  InvalidAppointmentTransitionError,
} from '../appointmentStateMachine';

describe('appointmentStateMachine', () => {
  describe('transiciones permitidas', () => {
    it.each([
      [S.REQUESTED, S.CONFIRMED],
      [S.REQUESTED, S.REJECTED],
      [S.REQUESTED, S.CANCELLED],
      [S.CONFIRMED, S.CHECKED_IN],
      [S.CONFIRMED, S.NO_SHOW],
      [S.CONFIRMED, S.CANCELLED],
      [S.CHECKED_IN, S.COMPLETED],
    ])('%s -> %s está permitida', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  });

  describe('transiciones rechazadas', () => {
    it.each([
      [S.REQUESTED, S.CHECKED_IN],
      [S.REQUESTED, S.COMPLETED],
      [S.REQUESTED, S.NO_SHOW],
      [S.CONFIRMED, S.COMPLETED],
      [S.CONFIRMED, S.REJECTED],
      [S.CHECKED_IN, S.CANCELLED],
      [S.CHECKED_IN, S.NO_SHOW],
    ])('%s -> %s no está permitida', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(InvalidAppointmentTransitionError);
    });

    it.each([S.COMPLETED, S.CANCELLED, S.NO_SHOW, S.REJECTED])(
      'el estado final %s no tiene salidas',
      (from) => {
        expect(allowedTransitionsFrom(from)).toEqual([]);
      }
    );

    it('no permite repetir el mismo estado', () => {
      expect(canTransition(S.CONFIRMED, S.CONFIRMED)).toBe(false);
    });
  });

  it('el error expone el código y los estados involucrados', () => {
    try {
      assertTransition(S.COMPLETED, S.CONFIRMED);
      throw new Error('debió lanzar');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAppointmentTransitionError);
      const err = error as InvalidAppointmentTransitionError;
      expect(err.code).toBe('APPOINTMENT_INVALID_TRANSITION');
      expect(err.from).toBe(S.COMPLETED);
      expect(err.to).toBe(S.CONFIRMED);
    }
  });
});
