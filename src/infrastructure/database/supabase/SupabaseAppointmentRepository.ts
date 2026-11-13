import type { SupabaseClient } from '@supabase/supabase-js';
import { AppointmentRecord, CancelledBy } from '@/domain/entities/Appointment';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import {
  AgendaFilter,
  AppointmentConflictError,
  IAppointmentRepository,
} from '@/domain/interfaces/IAppointmentRepository';
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
  cancellation_reason: string | null;
  cancelled_by: CancelledBy | null;
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
    cancellation_reason: record.cancellationReason,
    cancelled_by: record.cancelledBy,
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
    cancellationReason: row.cancellation_reason,
    cancelledBy: row.cancelled_by,
    createdBy: row.created_by,
  };
}

export class SupabaseAppointmentRepository implements IAppointmentRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(veterinaryId: string, id: string): Promise<AppointmentRecord | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('veterinary_id', veterinaryId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error consultando la cita: ${error.message}`);
    }
    return data ? fromRow(data as AppointmentRow) : null;
  }

  async findActive(veterinaryId: string, from: Date, to: Date): Promise<ActiveAppointment[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, employee_id, starts_at, ends_at')
      .eq('veterinary_id', veterinaryId)
      .in('status', ACTIVE_STATUSES)
      .lt('starts_at', to.toISOString())
      .gt('ends_at', from.toISOString());

    if (error) {
      throw new Error(`Error consultando citas activas: ${error.message}`);
    }

    return (data ?? [])
      .filter((r: { employee_id: string | null }) => r.employee_id !== null)
      .map((r: { id: string; employee_id: string; starts_at: string; ends_at: string }) => ({
        id: r.id,
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

  async update(record: AppointmentRecord): Promise<AppointmentRecord> {
    const { id, ...fields } = toRow(record);
    const { data, error } = await this.db
      .from(TABLE)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === PG_EXCLUSION_VIOLATION) {
        throw new AppointmentConflictError();
      }
      throw new Error(`Error actualizando la cita: ${error.message}`);
    }

    return fromRow(data as AppointmentRow);
  }

  async findAgenda(veterinaryId: string, filter: AgendaFilter): Promise<AppointmentRecord[]> {
    let query = this.db
      .from(TABLE)
      .select('*')
      .eq('veterinary_id', veterinaryId)
      .gte('starts_at', filter.from.toISOString())
      .lt('starts_at', filter.to.toISOString());

    if (filter.employeeId !== undefined) {
      query = query.eq('employee_id', filter.employeeId);
    }
    if (filter.statuses !== undefined) {
      query = query.in('status', filter.statuses);
    }

    const { data, error } = await query.order('starts_at', { ascending: true });
    if (error) {
      throw new Error(`Error consultando la agenda: ${error.message}`);
    }
    return (data ?? []).map((row) => fromRow(row as AppointmentRow));
  }

  async findByOwner(ownerUserId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at', { ascending: true });

    if (error) {
      throw new Error(`Error consultando las citas del dueño: ${error.message}`);
    }
    return (data ?? []).map((row) => fromRow(row as AppointmentRow));
  }
}
