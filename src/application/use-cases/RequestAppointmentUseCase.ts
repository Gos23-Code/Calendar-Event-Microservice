import { AppointmentRecord } from '@/domain/entities/Appointment';
import { Principal } from '@/domain/entities/Principal';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppError } from '@/domain/errors/AppError';
import { IAppointmentRepository, AppointmentConflictError } from '@/domain/interfaces/IAppointmentRepository';
import { IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IPetAccessProvider } from '@/domain/interfaces/IPetAccessProvider';
import { IScheduleRulesProvider } from '@/domain/interfaces/IScheduleRulesProvider';
import { IServiceCatalog } from '@/domain/interfaces/IServiceCatalog';
import { findAvailableSlot } from '@/application/services/findAvailableSlot';

// Anticipación mínima para reservas desde la app (CAL-04)
export const APP_MIN_LEAD_MINUTES = 60;

export interface RequestAppointmentDeps {
  rules: IScheduleRulesProvider;
  appointments: IAppointmentRepository;
  catalog: IServiceCatalog;
  pets: IPetAccessProvider;
  clinicConfig: IClinicConfigProvider;
  newId: () => string;
  now: () => Date;
}

export interface RequestAppointmentInput {
  veterinaryId: string; // de la ruta
  serviceId: string;
  petId: string;
  startsAt: Date;
  notes?: string | null;
}

// POST /veterinaries/{id}/appointment-requests — el dueño solicita desde la app.
// Nace REQUESTED o CONFIRMED según bookingRequiresConfirmation de la clínica.
export class RequestAppointmentUseCase {
  constructor(private readonly deps: RequestAppointmentDeps) {}

  async execute(principal: Principal, input: RequestAppointmentInput): Promise<AppointmentRecord> {
    if (principal.kind !== 'USER') {
      throw new AppError(403, 'OWNER_TOKEN_REQUIRED', 'Esta operación requiere un token de dueño');
    }

    // 1. Clínica abierta a reservas en línea
    const config = await this.deps.clinicConfig.get(input.veterinaryId);
    if (!config) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    if (config.status !== 'ACTIVE') {
      throw new AppError(403, 'CLINIC_NOT_ACTIVE', 'La clínica no está activa');
    }
    if (!config.allowOnlineBooking) {
      throw new AppError(403, 'ONLINE_BOOKING_DISABLED', 'La clínica no acepta reservas en línea');
    }

    // 2. Mascota del dueño y compartida con la clínica.
    // Mascota inexistente, ajena o sin dueño con app → la misma respuesta, para no revelar cuáles existen.
    const pet = await this.deps.pets.getPet(input.petId);
    if (!pet || pet.ownerUserId !== principal.userId) {
      throw new AppError(403, 'PET_NOT_OWNED', 'La mascota no es tuya');
    }
    const shared = await this.deps.pets.isSharedWithClinic(input.petId, input.veterinaryId);
    if (!shared) {
      throw new AppError(403, 'PET_NOT_SHARED', 'La mascota no está compartida con esta clínica');
    }

    // 3. Servicio y franja disponible (incluye la anticipación de 1 h)
    const service = await this.deps.catalog.get(input.veterinaryId, input.serviceId);
    if (!service) {
      throw new AppError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe en esta clínica');
    }

    const slot = await findAvailableSlot(
      { rules: this.deps.rules, appointments: this.deps.appointments },
      {
        veterinaryId: input.veterinaryId,
        startsAt: input.startsAt,
        durationMinutes: service.durationMinutes,
        now: this.deps.now(),
        minLeadMinutes: APP_MIN_LEAD_MINUTES,
        // Solo se asigna un empleado que Veterinary declare elegible para el servicio
        eligibleEmployeeIds: service.eligibleEmployeeIds,
      }
    );

    // 4. Persistir. Si la franja se ocupó entre la consulta y el insert, la base lo rechaza.
    const confirmed = !config.bookingRequiresConfirmation;
    const record: AppointmentRecord = {
      id: this.deps.newId(),
      veterinaryId: input.veterinaryId,
      employeeId: slot.employeeId,
      petId: input.petId,
      ownerUserId: principal.userId,
      serviceId: service.serviceId,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + service.durationMinutes * 60_000),
      status: confirmed ? AppointmentStatus.CONFIRMED : AppointmentStatus.REQUESTED,
      origin: AppointmentOrigin.APP,
      notes: input.notes ?? null,
      createdBy: principal.userId,
    };

    try {
      return await this.deps.appointments.insert(record);
    } catch (error) {
      if (error instanceof AppointmentConflictError) {
        throw new AppError(409, 'SLOT_UNAVAILABLE', 'La franja solicitada no está disponible');
      }
      throw error;
    }
  }
}
