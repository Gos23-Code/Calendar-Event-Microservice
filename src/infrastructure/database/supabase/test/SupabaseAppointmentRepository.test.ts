import type { SupabaseClient } from '@supabase/supabase-js';
import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { AppointmentConflictError } from '@/domain/interfaces/IAppointmentRepository';
import {
  ACTIVE_STATUSES,
  AppointmentRow,
  fromRow,
  PG_EXCLUSION_VIOLATION,
  SupabaseAppointmentRepository,
  toRow,
} from '../SupabaseAppointmentRepository';

type Result = { data?: unknown; error?: { code?: string; message: string } | null };
type Call = { method: string; args: unknown[] };

// Cliente falso: registra cada método encadenado y se resuelve con `result` al ser awaited.
function fakeDb(result: Result) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'in', 'lt', 'gt', 'insert', 'single']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject);

  return { db: builder as unknown as SupabaseClient, calls };
}

const RECORD: AppointmentRecord = {
  id: 'apt-1',
  veterinaryId: 'vet-1',
  employeeId: 'emp-1',
  petId: 'pet-1',
  ownerUserId: 'owner-1',
  serviceId: 'svc-1',
  serviceName: 'Control posoperatorio',
  durationMinutes: 30,
  price: 45000,
  startsAt: new Date('2026-12-07T15:00:00.000Z'),
  endsAt: new Date('2026-12-07T15:30:00.000Z'),
  status: AppointmentStatus.REQUESTED,
  origin: AppointmentOrigin.APP,
  notes: 'Se lame la herida',
  createdBy: 'owner-1',
};

const ROW: AppointmentRow = {
  id: 'apt-1',
  veterinary_id: 'vet-1',
  employee_id: 'emp-1',
  pet_id: 'pet-1',
  owner_user_id: 'owner-1',
  service_id: 'svc-1',
  service_name: 'Control posoperatorio',
  duration_minutes: 30,
  price: 45000,
  starts_at: '2026-12-07T15:00:00.000Z',
  ends_at: '2026-12-07T15:30:00.000Z',
  status: AppointmentStatus.REQUESTED,
  origin: AppointmentOrigin.APP,
  notes: 'Se lame la herida',
  created_by: 'owner-1',
};

describe('mapeo fila <-> registro', () => {
  it('toRow convierte a snake_case y fechas ISO', () => {
    expect(toRow(RECORD)).toEqual(ROW);
  });

  it('fromRow convierte de vuelta a camelCase y Date', () => {
    expect(fromRow(ROW)).toEqual(RECORD);
  });

  it('fromRow convierte un precio numeric que llega como texto', () => {
    expect(fromRow({ ...ROW, price: '45000.00' as unknown as number }).price).toBe(45000);
  });

  it('fromRow deja price null cuando no hay precio', () => {
    expect(fromRow({ ...ROW, price: null }).price).toBeNull();
  });
});

describe('SupabaseAppointmentRepository.findActive', () => {
  const from = new Date('2026-12-07T00:00:00.000Z');
  const to = new Date('2026-12-08T00:00:00.000Z');

  it('consulta la tabla appointments filtrando por clínica, estados activos y solapamiento', async () => {
    const { db, calls } = fakeDb({ data: [] });
    await new SupabaseAppointmentRepository(db).findActive('vet-1', from, to);

    expect(calls.map((c) => c.method)).toEqual(['from', 'select', 'eq', 'in', 'lt', 'gt']);
    expect(calls[0].args).toEqual(['appointments']);
    expect(calls[2].args).toEqual(['veterinary_id', 'vet-1']);
    expect(calls[3].args).toEqual(['status', ACTIVE_STATUSES]);
    expect(calls[4].args).toEqual(['starts_at', to.toISOString()]);
    expect(calls[5].args).toEqual(['ends_at', from.toISOString()]);
  });

  it('no incluye CANCELLED, COMPLETED, NO_SHOW ni REJECTED como activas', () => {
    expect(ACTIVE_STATUSES).toEqual([
      AppointmentStatus.REQUESTED,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CHECKED_IN,
    ]);
  });

  it('devuelve las franjas ocupadas y descarta filas sin empleado', async () => {
    const { db } = fakeDb({
      data: [
        { employee_id: 'emp-1', starts_at: '2026-12-07T15:00:00.000Z', ends_at: '2026-12-07T15:30:00.000Z' },
        { employee_id: null, starts_at: '2026-12-07T16:00:00.000Z', ends_at: '2026-12-07T16:30:00.000Z' },
      ],
    });

    const active = await new SupabaseAppointmentRepository(db).findActive('vet-1', from, to);

    expect(active).toEqual([
      {
        employeeId: 'emp-1',
        startsAt: new Date('2026-12-07T15:00:00.000Z'),
        endsAt: new Date('2026-12-07T15:30:00.000Z'),
      },
    ]);
  });

  it('error de la base → lanza Error (no se oculta)', async () => {
    const { db } = fakeDb({ error: { message: 'connection refused' } });
    await expect(new SupabaseAppointmentRepository(db).findActive('vet-1', from, to)).rejects.toThrow(
      /connection refused/
    );
  });
});

describe('SupabaseAppointmentRepository.insert', () => {
  it('inserta la fila en snake_case y devuelve el registro creado', async () => {
    const { db, calls } = fakeDb({ data: ROW });
    const saved = await new SupabaseAppointmentRepository(db).insert(RECORD);

    expect(calls.find((c) => c.method === 'insert')?.args).toEqual([toRow(RECORD)]);
    expect(saved).toEqual(RECORD);
  });

  it('la violación de no_overlap (23P01) se traduce a AppointmentConflictError', async () => {
    expect(PG_EXCLUSION_VIOLATION).toBe('23P01');
    const { db } = fakeDb({ error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } });

    await expect(new SupabaseAppointmentRepository(db).insert(RECORD)).rejects.toBeInstanceOf(
      AppointmentConflictError
    );
  });

  it('otro error de la base no se confunde con conflicto', async () => {
    const { db } = fakeDb({ error: { code: '23514', message: 'check constraint violated' } });

    const promise = new SupabaseAppointmentRepository(db).insert(RECORD);
    await expect(promise).rejects.toThrow(/check constraint/);
    await expect(promise).rejects.not.toBeInstanceOf(AppointmentConflictError);
  });
});
