import { AppointmentRecord } from '../entities/Appointment';
import { AppointmentStatus } from '../enums/AppointmentStatus';
import { ActiveAppointment } from '../services/availability';

// Filtros de la agenda de una clínica. Se filtra por la hora de inicio dentro del rango [from, to).
export interface AgendaFilter {
  from: Date;
  to: Date;
  employeeId?: string;
  statuses?: AppointmentStatus[];
}

// Choque de la restricción no_overlap de la base (mismo veterinario, franja solapada).
export class AppointmentConflictError extends Error {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor() {
    super('El veterinario ya tiene una cita en esa franja');
    this.name = 'AppointmentConflictError';
  }
}

export interface IAppointmentRepository {
  // Busca una cita dentro de una clínica. null si no existe o es de otra clínica.
  findById(veterinaryId: string, id: string): Promise<AppointmentRecord | null>;
  // Citas activas (REQUESTED, CONFIRMED, CHECKED_IN) que solapan el rango.
  findActive(veterinaryId: string, from: Date, to: Date): Promise<ActiveAppointment[]>;
  // Inserta la cita. Lanza AppointmentConflictError si la base rechaza la doble reserva.
  insert(record: AppointmentRecord): Promise<AppointmentRecord>;
  // Actualiza la cita. Lanza AppointmentConflictError si la nueva franja choca.
  update(record: AppointmentRecord): Promise<AppointmentRecord>;
  // Agenda de una clínica, ordenada por hora de inicio.
  findAgenda(veterinaryId: string, filter: AgendaFilter): Promise<AppointmentRecord[]>;
  // Citas de un dueño en todas las clínicas, ordenadas por hora de inicio.
  findByOwner(ownerUserId: string, from: Date, to: Date): Promise<AppointmentRecord[]>;
}
