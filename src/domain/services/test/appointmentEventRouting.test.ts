import { AppointmentEventType } from '@/domain/enums/AppointmentEventType';
import { audienceFor } from '../appointmentEventRouting';

describe('audienceFor (a quién llega cada evento)', () => {
  it.each([
    [AppointmentEventType.REQUESTED, undefined, 'CLINIC'],
    [AppointmentEventType.CONFIRMED, undefined, 'OWNER'],
    [AppointmentEventType.REJECTED, undefined, 'OWNER'],
    [AppointmentEventType.COMPLETED, undefined, 'OWNER'],
    [AppointmentEventType.REMINDER, undefined, 'OWNER'],
  ])('%s → %s', (eventType, by, expected) => {
    expect(audienceFor(eventType, by as 'OWNER' | undefined)).toBe(expected);
  });

  it('cancelación hecha por el dueño avisa a la clínica', () => {
    expect(audienceFor(AppointmentEventType.CANCELLED, 'OWNER')).toBe('CLINIC');
  });

  it('cancelación hecha por la clínica avisa al dueño', () => {
    expect(audienceFor(AppointmentEventType.CANCELLED, 'CLINIC')).toBe('OWNER');
  });

  it('reprogramación hecha por el dueño avisa a la clínica', () => {
    expect(audienceFor(AppointmentEventType.RESCHEDULED, 'OWNER')).toBe('CLINIC');
  });

  it('reprogramación hecha por la clínica avisa al dueño', () => {
    expect(audienceFor(AppointmentEventType.RESCHEDULED, 'CLINIC')).toBe('OWNER');
  });
});
