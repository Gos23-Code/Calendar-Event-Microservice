import { AppointmentEventType } from '../enums/AppointmentEventType';

// Quién actuó sobre la cita. Determina a quién se notifica en cancelaciones y reprogramaciones.
export type Actor = 'OWNER' | 'CLINIC';

// Contacto para quien no tiene cuenta en la app (sobre común, CONTRATOS_COMPARTIDOS.md 4.1).
export interface EventRecipient {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface AppointmentEventPayload {
  appointmentId: string;
  veterinaryId: string;
  veterinaryName: string;
  address: string | null;
  phone: string | null;
  petName: string;
  serviceName: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  cancellationReason: string | null;
}

// Sobre común que consume el notification-microservice.
export interface AppointmentEventMessage {
  eventType: AppointmentEventType;
  userId: string | null;
  recipient: EventRecipient | null;
  payload: AppointmentEventPayload;
  occurredAt: string;
  metadata: {
    version: '1.0';
    source: 'calendar-service';
    veterinaryId: string;
    correlationId: string;
  };
}
