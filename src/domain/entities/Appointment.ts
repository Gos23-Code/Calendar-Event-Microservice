import { AppointmentOrigin } from '../enums/AppointmentOrigin';
import { AppointmentStatus } from '../enums/AppointmentStatus';

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
  createdBy: string;
}
