import { AppointmentOrigin } from '../enums/AppointmentOrigin';
import { AppointmentStatus } from '../enums/AppointmentStatus';

export type CancelledBy = 'OWNER' | 'CLINIC';

// Registro de cita tal como se persiste en public.appointments (mapeado a camelCase).
export interface AppointmentRecord {
  id: string;
  veterinaryId: string;
  employeeId: string | null;
  petId: string;
  ownerUserId: string | null;
  serviceId: string;
  serviceName: string; // snapshot
  durationMinutes: number; // snapshot
  price: number | null; // snapshot
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  notes: string | null;
  cancellationReason: string | null; // motivo de rechazo o cancelación
  cancelledBy: CancelledBy | null;
  createdBy: string;
}
