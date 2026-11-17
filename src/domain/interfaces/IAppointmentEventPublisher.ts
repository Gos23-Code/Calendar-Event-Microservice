import { AppointmentEventMessage } from '../entities/AppointmentEvent';

// Publica un evento de cita. La implementación real usa Pub/Sub (topic veterinary-appointments);
// en pruebas se usa un publicador en memoria.
export interface IAppointmentEventPublisher {
  publish(message: AppointmentEventMessage): Promise<void>;
}
