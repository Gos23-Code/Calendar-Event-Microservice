import type { SupabaseClient } from '@supabase/supabase-js';
import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppointmentConflictError, IAppointmentRepository } from '@/domain/interfaces/IAppointmentRepository';
import { ActiveAppointment } from '@/domain/services/availability';

const TABLE = 'appointments';

// Citas que ocupan la agenda (CAL-03 / CAL-04)
export const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

// Código de Postgres para exclusion_violation (la restricción no_overlap)
export const PG_EXCLUSION_VIOLATION = '23P01';

export interface AppointmentRow {
  id: string;
  veterinary_id: string;
  employee_id: string | null;
  pet_id: string;
  owner_user_id: string | null;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  price: number | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  notes: string | null;
  created_by: string;
}

export function toRow(record: AppointmentRecord): AppointmentRow {
  return {
    id: record.id,
    veterinary_id: record.veterinaryId,
    employee_id: record.employeeId,
    pet_id: record.petId,
    owner_user_id: record.ownerUserId,
    service_id: record.serviceId,
    service_name: record.serviceName,
    duration_minutes: record.durationMinutes,
    price: record.price,
    starts_at: record.startsAt.toISOString(),
    ends_at: record.endsAt.toISOString(),
    status: record.status,
    origin: record.origin,
    notes: record.notes,
    created_by: record.createdBy,
  };
}

export function fromRow(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    veterinaryId: row.veterinary_id,
    employeeId: row.employee_id,
    petId: row.pet_id,
    ownerUserId: row.owner_user_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    durationMinutes: row.duration_minutes,
    price: row.price === null ? null : Number(row.price), // numeric llega como texto en algunos casos
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    status: row.status,
    origin: row.origin,
    notes: row.notes,
    createdBy: row.created_by,
  };
}

export class SupabaseAppointmentRepository implements IAppointmentRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findActive(veterinaryId: string, from: Date, to: Date): Promise<ActiveAppointment[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('employee_id, starts_at, ends_at')
      .eq('veterinary_id', veterinaryId)
      .in('status', ACTIVE_STATUSES)
      .lt('starts_at', to.toISOString())
      .gt('ends_at', from.toISOString());

    if (error) {
      throw new Error(`Error consultando citas activas: ${error.message}`);
    }

    return (data ?? [])
      .filter((r: { employee_id: string | null }) => r.employee_id !== null)
      .map((r: { employee_id: string; starts_at: string; ends_at: string }) => ({
        employeeId: r.employee_id,
        startsAt: new Date(r.starts_at),
        endsAt: new Date(r.ends_at),
      }));
  }

  async insert(record: AppointmentRecord): Promise<AppointmentRecord> {
    const { data, error } = await this.db.from(TABLE).insert(toRow(record)).select().single();

    if (error) {
      if (error.code === PG_EXCLUSION_VIOLATION) {
        throw new AppointmentConflictError();
      }
      throw new Error(`Error creando la cita: ${error.message}`);
    }

    return fromRow(data as AppointmentRow);
  }
}
