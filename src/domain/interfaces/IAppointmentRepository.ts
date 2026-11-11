import { ActiveAppointment } from '../services/availability';
import { AppointmentRecord } from '../entities/Appointment';

// Choque de la restricción no_overlap de la base (mismo veterinario, franja solapada).
export class AppointmentConflictError extends Error {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor() {
    super('El veterinario ya tiene una cita en esa franja');
    this.name = 'AppointmentConflictError';
  }
}

export interface IAppointmentRepository {
  // Citas activas (REQUESTED, CONFIRMED, CHECKED_IN) que solapan el rango.
  findActive(veterinaryId: string, from: Date, to: Date): Promise<ActiveAppointment[]>;
  // Inserta la cita. Lanza AppointmentConflictError si la base rechaza la doble reserva.
  insert(record: AppointmentRecord): Promise<AppointmentRecord>;
}
