import { AppointmentRecord } from '@/domain/entities/Appointment';
import { Principal } from '@/domain/entities/Principal';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppError } from '@/domain/errors/AppError';
import { AppointmentConflictError, IAppointmentRepository } from '@/domain/interfaces/IAppointmentRepository';
import { IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IScheduleRulesProvider } from '@/domain/interfaces/IScheduleRulesProvider';
import { IServiceCatalog } from '@/domain/interfaces/IServiceCatalog';
import { IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';
import { noShowAllowedAt, ownerCanCancelAt } from '@/domain/services/appointmentRules';
import { assertTransition, InvalidAppointmentTransitionError } from '@/domain/services/appointmentStateMachine';
import { assertSameVeterinary } from '@/domain/services/tenant';
import { findAvailableSlot } from '@/application/services/findAvailableSlot';
import { APPOINTMENT_MANAGE } from './CreateClinicAppointmentUseCase';
import { APP_MIN_LEAD_MINUTES } from './RequestAppointmentUseCase';

export interface LifecycleDeps {
  appointments: IAppointmentRepository;
  access: IVeterinaryAccess;
  clinicConfig: IClinicConfigProvider;
  rules: IScheduleRulesProvider;
  catalog: IServiceCatalog;
  now: () => Date;
}

// Acciones sobre una cita ya creada (CALENDAR_SERVICE_CHANGES.md, CAL-03 y CAL-05).
// Cada método: 1) quién lo pide, 2) la cita existe en esa clínica, 3) la transición es válida,
// 4) las reglas de tiempo, 5) se guarda.
export class AppointmentLifecycleUseCase {
  constructor(private readonly deps: LifecycleDeps) {}

  // PATCH .../confirm — clínica. REQUESTED → CONFIRMED
  async confirm(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    const appt = await this.clinicAction(principal, veterinaryId, id);
    return this.save({ ...this.transition(appt, AppointmentStatus.CONFIRMED) });
  }

  // PATCH .../reject — clínica, con motivo. REQUESTED → REJECTED
  async reject(principal: Principal, veterinaryId: string, id: string, reason: string): Promise<AppointmentRecord> {
    const motive = requireReason(reason);
    const appt = await this.clinicAction(principal, veterinaryId, id);
    return this.save({
      ...this.transition(appt, AppointmentStatus.REJECTED),
      cancellationReason: motive,
      cancelledBy: 'CLINIC',
    });
  }

  // PATCH .../cancel — dueño (con plazo) o clínica. REQUESTED|CONFIRMED → CANCELLED
  async cancel(
    principal: Principal,
    veterinaryId: string,
    id: string,
    reason: string | null = null
  ): Promise<AppointmentRecord> {
    if (principal.kind === 'USER') {
      const appt = await this.ownerAction(principal, veterinaryId, id);
      await this.assertOwnerWindow(veterinaryId, appt);
      return this.save({
        ...this.transition(appt, AppointmentStatus.CANCELLED),
        cancellationReason: reason,
        cancelledBy: 'OWNER',
      });
    }

    const appt = await this.clinicAction(principal, veterinaryId, id);
    return this.save({
      ...this.transition(appt, AppointmentStatus.CANCELLED),
      cancellationReason: reason,
      cancelledBy: 'CLINIC',
    });
  }

  // PATCH .../check-in — clínica. CONFIRMED → CHECKED_IN
  async checkIn(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    const appt = await this.clinicAction(principal, veterinaryId, id);
    return this.save(this.transition(appt, AppointmentStatus.CHECKED_IN));
  }

  // PATCH .../complete — clínica. CHECKED_IN → COMPLETED
  async complete(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    const appt = await this.clinicAction(principal, veterinaryId, id);
    return this.save(this.transition(appt, AppointmentStatus.COMPLETED));
  }

  // PATCH .../no-show — clínica, solo después de starts_at. CONFIRMED → NO_SHOW
  async noShow(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    const appt = await this.clinicAction(principal, veterinaryId, id);
    if (!noShowAllowedAt(appt.startsAt, this.deps.now())) {
      throw new AppError(409, 'NO_SHOW_TOO_EARLY', 'Solo se puede marcar no asistió después del inicio de la cita');
    }
    return this.save(this.transition(appt, AppointmentStatus.NO_SHOW));
  }

  // PATCH .../reschedule — clínica o dueño. Revalida disponibilidad; mantiene el empleado.
  async reschedule(
    principal: Principal,
    veterinaryId: string,
    id: string,
    newStartsAt: Date
  ): Promise<AppointmentRecord> {
    const isOwner = principal.kind === 'USER';
    const appt = isOwner
      ? await this.ownerAction(principal, veterinaryId, id)
      : await this.clinicAction(principal, veterinaryId, id);

    if (appt.status !== AppointmentStatus.REQUESTED && appt.status !== AppointmentStatus.CONFIRMED) {
      throw new AppError(409, 'APPOINTMENT_NOT_RESCHEDULABLE', `Una cita ${appt.status} no se puede reprogramar`);
    }
    if (isOwner) {
      await this.assertOwnerWindow(veterinaryId, appt);
    }

    const service = await this.deps.catalog.get(veterinaryId, appt.serviceId);
    if (!service) {
      throw new AppError(404, 'SERVICE_NOT_FOUND', 'El servicio ya no existe en esta clínica');
    }

    const slot = await findAvailableSlot(
      { rules: this.deps.rules, appointments: this.deps.appointments },
      {
        veterinaryId,
        startsAt: newStartsAt,
        durationMinutes: appt.durationMinutes,
        now: this.deps.now(),
        minLeadMinutes: isOwner ? APP_MIN_LEAD_MINUTES : 0,
        employeeId: appt.employeeId ?? undefined,
        eligibleEmployeeIds: service.eligibleEmployeeIds,
        excludeAppointmentId: appt.id,
      }
    );

    return this.save({
      ...appt,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      employeeId: slot.employeeId,
    });
  }

  // --- helpers ---

  // Clínica: token de clínica, mismo tenant, cita existente, acceso y permiso APPOINTMENT_MANAGE.
  private async clinicAction(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    if (principal.kind !== 'VETERINARY') {
      throw new AppError(403, 'CLINIC_TOKEN_REQUIRED', 'Esta operación requiere un token de clínica');
    }
    assertSameVeterinary(principal.vetId, veterinaryId);

    const appt = await this.load(veterinaryId, id);

    const access = await this.deps.access.getAccess(veterinaryId, appt.petId, principal.userId);
    if (!access) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    if (!access.hasAccess) {
      throw new AppError(403, 'ACCESS_DENIED', 'No tienes acceso a esta mascota en la clínica');
    }
    if (!access.permissions.includes(APPOINTMENT_MANAGE)) {
      throw new AppError(403, 'PERMISSION_DENIED', 'No tienes permiso para gestionar citas');
    }
    return appt;
  }

  // Dueño: token de dueño y cita propia. Una cita ajena responde 404 para no revelar que existe.
  private async ownerAction(principal: Principal, veterinaryId: string, id: string): Promise<AppointmentRecord> {
    if (principal.kind !== 'USER') {
      throw new AppError(403, 'OWNER_TOKEN_REQUIRED', 'Esta operación requiere un token de dueño');
    }
    const appt = await this.load(veterinaryId, id);
    if (appt.ownerUserId !== principal.userId) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    return appt;
  }

  // Plazo del dueño: cancelationMinHours de la clínica.
  private async assertOwnerWindow(veterinaryId: string, appt: AppointmentRecord): Promise<void> {
    const config = await this.deps.clinicConfig.get(veterinaryId);
    if (!config) {
      throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
    }
    if (!ownerCanCancelAt(appt.startsAt, this.deps.now(), config.cancellationMinHours)) {
      throw new AppError(409, 'CANCELLATION_TOO_LATE', 'Ya no se puede modificar la cita: el plazo venció');
    }
  }

  private async load(veterinaryId: string, id: string): Promise<AppointmentRecord> {
    const appt = await this.deps.appointments.findById(veterinaryId, id);
    if (!appt) {
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'La cita no existe');
    }
    return appt;
  }

  private transition(appt: AppointmentRecord, to: AppointmentStatus): AppointmentRecord {
    try {
      assertTransition(appt.status, to);
    } catch (error) {
      if (error instanceof InvalidAppointmentTransitionError) {
        throw new AppError(409, 'APPOINTMENT_INVALID_TRANSITION', error.message);
      }
      throw error;
    }
    return { ...appt, status: to };
  }

  private async save(next: AppointmentRecord): Promise<AppointmentRecord> {
    try {
      return await this.deps.appointments.update(next);
    } catch (error) {
      if (error instanceof AppointmentConflictError) {
        throw new AppError(409, 'SLOT_UNAVAILABLE', 'La franja solicitada no está disponible');
      }
      throw error;
    }
  }
}

function requireReason(reason: string): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'El motivo es obligatorio');
  }
  return trimmed;
}
