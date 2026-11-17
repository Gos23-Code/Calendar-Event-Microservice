import { Actor } from '../entities/AppointmentEvent';
import { AppointmentEventType } from '../enums/AppointmentEventType';

// Quién recibe cada evento (CALENDAR_SERVICE_CHANGES.md, CAL-06).
// - REQUESTED: la clínica (el dueño acaba de pedir la cita).
// - CONFIRMED, REJECTED, COMPLETED, REMINDER: el dueño.
// - RESCHEDULED y CANCELLED: la otra parte. Si actuó la clínica, avisa al dueño; si actuó el dueño, a la clínica.
export type Audience = 'OWNER' | 'CLINIC';

export function audienceFor(eventType: AppointmentEventType, by?: Actor): Audience {
  switch (eventType) {
    case AppointmentEventType.REQUESTED:
      return 'CLINIC';
    case AppointmentEventType.CONFIRMED:
    case AppointmentEventType.REJECTED:
    case AppointmentEventType.COMPLETED:
    case AppointmentEventType.REMINDER:
      return 'OWNER';
    case AppointmentEventType.RESCHEDULED:
    case AppointmentEventType.CANCELLED:
      return by === 'OWNER' ? 'CLINIC' : 'OWNER';
  }
}
