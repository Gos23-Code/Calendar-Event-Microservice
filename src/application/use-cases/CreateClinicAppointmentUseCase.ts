import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppError } from '@/domain/errors/AppError';
import { IAppointmentRepository, AppointmentConflictError } from '@/domain/interfaces/IAppointmentRepository';
import { IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';
import { IPetAccessProvider } from '@/domain/interfaces/IPetAccessProvider';
import { IScheduleRulesProvider } from '@/domain/interfaces/IScheduleRulesProvider';
import { IServiceCatalog } from '@/domain/interfaces/IServiceCatalog';
import { Principal } from '@/domain/entities/Principal';
import { assertSameVeterinary } from '@/domain/services/tenant';
import { findAvailableSlot } from '@/application/services/findAvailableSlot';

export const APPOINTMENT_MANAGE = 'APPOINTMENT_MANAGE';

export interface CreateClinicAppointmentDeps {
  rules: IScheduleRulesProvider;
  appointments: IAppointmentRepository;
  catalog: IServiceCatalog;
  pets: IPetAccessProvider;
  access: IVeterinaryAccess;
  clinicConfig: IClinicConfigProvider;
  newId: () => string;
  now: () => Date;
}

export interface CreateClinicAppointmentInput {
  veterinaryId: string; // de la ruta
  serviceId: string;
  petId: string;
  employeeId: string;
  startsAt: Date;
  notes?: string | null;
}

// POST /veterinaries/{id}/appointments — la clínica crea la cita; nace CONFIRMED.
export class CreateClinicAppointmentUseCase {
  constructor(private readonly deps: CreateClinicAppointmentDeps) {}

  async execute(principal: Principal, input: CreateClinicAppointmentInput): Promise<AppointmentRecord> {
    if (principal.kind !== 'VETERINARY') {
      throw new AppError(403, 'CLINIC_TOKEN_REQUIRED', 'Esta operación requiere un token de clínica');
    }

    // 1. Tenant: vet_id del token debe coincidir con la ruta (404 si no)
    assertSameVeterinary(principal.vetId, input.veterinaryId);

    // 2. Acceso a la mascota y permiso APPOINTMENT_MANAGE, resueltos por Veterinary (endpoint access).
    // hasAccess = false cubre: no es empleado activo, clínica no ACTIVE o mascota no compartida.
    const access = await this.deps.access.getAccess(input.veterinaryId, input.petId, principal.userId);
    if (!access) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    if (!access.hasAccess) {
      throw new AppError(403, 'ACCESS_DENIED', 'No tienes acceso a esta mascota en la clínica');
    }
    if (!access.permissions.includes(APPOINTMENT_MANAGE)) {
      throw new AppError(403, 'PERMISSION_DENIED', 'No tienes permiso para gestionar citas');
    }

    // 3. Clínica, servicio y mascota
    const config = await this.deps.clinicConfig.get(input.veterinaryId);
    if (!config) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }

    const service = await this.deps.catalog.get(input.veterinaryId, input.serviceId);
    if (!service) {
      throw new AppError(404, 'SERVICE_NOT_FOUND', 'El servicio no existe en esta clínica');
    }

    // Licencia exigida por el catálogo de Veterinary (CONTRATOS_COMPARTIDOS.md, 1.3)
    if (service.requiresLicense && !access.licensed) {
      throw new AppError(403, 'LICENSE_REQUIRED', 'El servicio requiere un profesional con licencia verificada');
    }

    const pet = await this.deps.pets.getPet(input.petId);
    if (!pet) {
      throw new AppError(404, 'PET_NOT_FOUND', 'La mascota no existe');
    }

    // 4. Empleado y franja (404 si el empleado no es de la clínica, 409 si la franja no está libre)
    await findAvailableSlot(
      { rules: this.deps.rules, appointments: this.deps.appointments },
      {
        veterinaryId: input.veterinaryId,
        startsAt: input.startsAt,
        durationMinutes: service.durationMinutes,
        now: this.deps.now(),
        minLeadMinutes: 0,
        employeeId: input.employeeId,
        eligibleEmployeeIds: service.eligibleEmployeeIds,
      }
    );

    // 5. Persistir. La base también valida la doble reserva (no_overlap).
    const record: AppointmentRecord = {
      id: this.deps.newId(),
      veterinaryId: input.veterinaryId,
      employeeId: input.employeeId,
      petId: input.petId,
      ownerUserId: pet.ownerUserId,
      serviceId: service.serviceId,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + service.durationMinutes * 60_000),
      status: AppointmentStatus.CONFIRMED,
      origin: AppointmentOrigin.CLINIC,
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
