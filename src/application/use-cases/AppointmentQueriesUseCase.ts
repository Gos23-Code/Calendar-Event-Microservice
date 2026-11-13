import { AppointmentRecord } from '@/domain/entities/Appointment';
import { Principal } from '@/domain/entities/Principal';
import { AppError } from '@/domain/errors/AppError';
import { IAppointmentRepository, AgendaFilter } from '@/domain/interfaces/IAppointmentRepository';
import { IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IStaffDirectory } from '@/domain/interfaces/IStaffDirectory';
import { assertSameVeterinary } from '@/domain/services/tenant';
import { assertRange } from '@/application/services/validateRange';
import { APPOINTMENT_MANAGE } from './CreateClinicAppointmentUseCase';

// Consultas de citas (CAL-05): agenda de la clínica y lista del dueño.

export interface AgendaDeps {
  appointments: IAppointmentRepository;
  staff: IStaffDirectory;
}

// Agenda de una clínica: GET /veterinaries/{id}/appointments
export class ClinicAgendaUseCase {
  constructor(private readonly deps: AgendaDeps) {}

  async list(principal: Principal, veterinaryId: string, filter: AgendaFilter): Promise<AppointmentRecord[]> {
    if (principal.kind !== 'VETERINARY') {
      throw new AppError(403, 'CLINIC_TOKEN_REQUIRED', 'Esta operación requiere un token de clínica');
    }
    assertSameVeterinary(principal.vetId, veterinaryId);

    const permissions = await this.deps.staff.getPermissions(veterinaryId, principal.userId);
    if (permissions === null) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    if (!permissions.includes(APPOINTMENT_MANAGE)) {
      throw new AppError(403, 'PERMISSION_DENIED', 'No tienes permiso para ver la agenda');
    }

    assertRange(filter.from, filter.to);
    return this.deps.appointments.findAgenda(veterinaryId, filter);
  }
}

export interface OwnerAppointmentView {
  appointment: AppointmentRecord;
  clinicName: string | null;
}

export interface OwnerDeps {
  appointments: IAppointmentRepository;
  clinicConfig: IClinicConfigProvider;
}

// Citas del dueño en todas las clínicas: GET /me/appointments
export class OwnerAppointmentsUseCase {
  constructor(private readonly deps: OwnerDeps) {}

  async list(principal: Principal, from: Date, to: Date): Promise<OwnerAppointmentView[]> {
    if (principal.kind !== 'USER') {
      throw new AppError(403, 'OWNER_TOKEN_REQUIRED', 'Esta operación requiere un token de dueño');
    }
    assertRange(from, to);

    const records = await this.deps.appointments.findByOwner(principal.userId, from, to);

    // Nombre de cada clínica, consultado una vez por clínica
    const names = new Map<string, string | null>();
    for (const record of records) {
      if (!names.has(record.veterinaryId)) {
        const config = await this.deps.clinicConfig.get(record.veterinaryId);
        names.set(record.veterinaryId, config ? config.name : null);
      }
    }

    return records.map((appointment) => ({
      appointment,
      clinicName: names.get(appointment.veterinaryId) ?? null,
    }));
  }
}
