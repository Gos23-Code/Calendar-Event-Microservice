import { AppointmentRecord } from '@/domain/entities/Appointment';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import {
  AgendaFilter,
  AppointmentConflictError,
  IAppointmentRepository,
} from '@/domain/interfaces/IAppointmentRepository';
import { ClinicConfig, IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { AccessDecision, IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';
import { IPetAccessProvider, PetInfo } from '@/domain/interfaces/IPetAccessProvider';
import { IServiceCatalog, ServiceInfo } from '@/domain/interfaces/IServiceCatalog';
import { ActiveAppointment } from '@/domain/services/availability';
import { SimulatedScheduleRulesProvider } from '@/infrastructure/veterinary/SimulatedScheduleRulesProvider';

export const VET = 'vet-1';
export const OTHER_VET = 'vet-2';
export const OWNER = 'owner-1';
export const OTHER_OWNER = 'owner-2';
export const CLINIC_USER = 'clinic-user-1';
export const PET = 'pet-1';
export const PET_OTHER_OWNER = 'pet-ajena';
export const PET_NO_APP = 'pet-sin-app';
export const SERVICE = 'svc-1';
export const SERVICE_LICENSED = 'svc-cirugia';
export const SERVICE_BANO = 'svc-bano';

// IDs de empleados de SimulatedScheduleRulesProvider
export const LUIS = 'aaaaaaaa-0000-4000-8000-000000000001';
export const SARA = 'bbbbbbbb-0000-4000-8000-000000000002';
export const CAMILA = 'cccccccc-0000-4000-8000-000000000003';

// Lunes 2026-12-01 00:00 UTC, antes de cualquier franja de prueba.
export const NOW = new Date('2026-12-01T00:00:00.000Z');
// Lunes 2026-12-07 10:00 en Bogotá (UTC-5)
export const SLOT_10AM = new Date('2026-12-07T15:00:00.000Z');

const ACTIVE = [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN];

// Repositorio en memoria que aplica la misma regla que la base (no_overlap por empleado).
export class InMemoryAppointmentRepository implements IAppointmentRepository {
  rows: AppointmentRecord[];

  constructor(initial: AppointmentRecord[] = []) {
    this.rows = [...initial];
  }

  async findActive(veterinaryId: string, from: Date, to: Date): Promise<ActiveAppointment[]> {
    return this.rows
      .filter(
        (r) =>
          r.veterinaryId === veterinaryId &&
          r.employeeId !== null &&
          ACTIVE.includes(r.status) &&
          r.startsAt < to &&
          r.endsAt > from
      )
      .map((r) => ({ id: r.id, employeeId: r.employeeId as string, startsAt: r.startsAt, endsAt: r.endsAt }));
  }

  async findById(veterinaryId: string, id: string): Promise<AppointmentRecord | null> {
    return this.rows.find((r) => r.veterinaryId === veterinaryId && r.id === id) ?? null;
  }

  private conflictsWith(candidate: AppointmentRecord): boolean {
    return this.rows.some(
      (r) =>
        r.id !== candidate.id &&
        r.employeeId !== null &&
        r.employeeId === candidate.employeeId &&
        ACTIVE.includes(r.status) &&
        ACTIVE.includes(candidate.status) &&
        r.startsAt < candidate.endsAt &&
        candidate.startsAt < r.endsAt
    );
  }

  async insert(record: AppointmentRecord): Promise<AppointmentRecord> {
    if (this.conflictsWith(record)) {
      throw new AppointmentConflictError();
    }
    this.rows.push(record);
    return record;
  }

  async update(record: AppointmentRecord): Promise<AppointmentRecord> {
    if (this.conflictsWith(record)) {
      throw new AppointmentConflictError();
    }
    this.rows = this.rows.map((r) => (r.id === record.id ? record : r));
    return record;
  }

  async findAgenda(veterinaryId: string, filter: AgendaFilter): Promise<AppointmentRecord[]> {
    return this.rows
      .filter(
        (r) =>
          r.veterinaryId === veterinaryId &&
          r.startsAt >= filter.from &&
          r.startsAt < filter.to &&
          (filter.employeeId === undefined || r.employeeId === filter.employeeId) &&
          (filter.statuses === undefined || filter.statuses.includes(r.status))
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async findByOwner(ownerUserId: string, from: Date, to: Date): Promise<AppointmentRecord[]> {
    return this.rows
      .filter((r) => r.ownerUserId === ownerUserId && r.startsAt >= from && r.startsAt < to)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
}

export function makeRecord(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: 'existing-1',
    veterinaryId: VET,
    employeeId: LUIS,
    petId: PET,
    ownerUserId: OWNER,
    serviceId: SERVICE,
    serviceName: 'Consulta general',
    durationMinutes: 30,
    price: 45000,
    startsAt: new Date('2026-12-07T15:00:00.000Z'),
    endsAt: new Date('2026-12-07T15:30:00.000Z'),
    status: AppointmentStatus.CONFIRMED,
    origin: AppointmentOrigin.CLINIC,
    notes: null,
    cancellationReason: null,
    cancelledBy: null,
    createdBy: CLINIC_USER,
    ...overrides,
  };
}

const DEFAULT_CONFIG: ClinicConfig = {
  veterinaryId: VET,
  name: 'Clínica Patitas',
  status: 'ACTIVE',
  allowOnlineBooking: true,
  bookingRequiresConfirmation: false,
  cancellationMinHours: 24,
  timezone: 'America/Bogota',
};

export interface FakeOptions {
  config?: Partial<ClinicConfig> | null; // null = clínica inexistente
  repo?: InMemoryAppointmentRepository;
  petShared?: boolean;
  access?: Partial<AccessDecision> | null; // decisión de acceso de Veterinary; null = clínica/mascota inexistente
  now?: Date;
}

export const DEFAULT_ACCESS: AccessDecision = {
  hasAccess: true,
  veterinaryStatus: 'ACTIVE',
  employeeId: LUIS,
  role: 'VETERINARIAN',
  licensed: true,
  permissions: ['APPOINTMENT_MANAGE'],
};

export function makeDeps(options: FakeOptions = {}) {
  const repo = options.repo ?? new InMemoryAppointmentRepository();
  const config: ClinicConfig | null =
    options.config === null ? null : { ...DEFAULT_CONFIG, ...(options.config ?? {}) };

  const pets: Record<string, PetInfo> = {
    [PET]: { petId: PET, ownerUserId: OWNER },
    [PET_OTHER_OWNER]: { petId: PET_OTHER_OWNER, ownerUserId: OTHER_OWNER },
    [PET_NO_APP]: { petId: PET_NO_APP, ownerUserId: null },
  };

  const services: Record<string, ServiceInfo> = {
    [SERVICE]: {
      serviceId: SERVICE,
      name: 'Consulta general',
      durationMinutes: 30,
      price: 45000,
      requiresLicense: false,
      eligibleEmployeeIds: [LUIS, SARA],
    },
    [SERVICE_LICENSED]: {
      serviceId: SERVICE_LICENSED,
      name: 'Cirugía',
      durationMinutes: 30,
      price: 300000,
      requiresLicense: true,
      eligibleEmployeeIds: [LUIS, SARA],
    },
    [SERVICE_BANO]: {
      serviceId: SERVICE_BANO,
      name: 'Baño y corte',
      durationMinutes: 60,
      price: 50000,
      requiresLicense: false,
      eligibleEmployeeIds: [CAMILA],
    },
  };

  const clinicConfig: IClinicConfigProvider = {
    get: jest.fn(async (vetId: string) => (config && vetId === VET ? config : null)),
  };

  const catalog: IServiceCatalog = {
    get: jest.fn(async (vetId: string, serviceId: string) =>
      vetId === VET ? services[serviceId] ?? null : null
    ),
  };

  const petAccess: IPetAccessProvider = {
    getPet: jest.fn(async (petId: string) => pets[petId] ?? null),
    isSharedWithClinic: jest.fn(async () => options.petShared ?? true),
  };

  const access: IVeterinaryAccess = {
    getAccess: jest.fn(async (vetId: string) => {
      if (vetId !== VET || options.access === null) return null;
      return { ...DEFAULT_ACCESS, ...(options.access ?? {}) };
    }),
  };

  let counter = 0;

  return {
    rules: new SimulatedScheduleRulesProvider(),
    appointments: repo,
    catalog,
    pets: petAccess,
    access,
    clinicConfig,
    newId: () => `apt-${++counter}`,
    now: () => options.now ?? NOW,
  };
}

export const clinicPrincipal = (vetId = VET) => ({
  kind: 'VETERINARY' as const,
  userId: CLINIC_USER,
  vetId,
  vetRole: 'VET',
  employeeId: LUIS,
  vetLicensed: true,
  vetStatus: 'ACTIVE',
});

export const ownerPrincipal = (userId = OWNER) => ({ kind: 'USER' as const, userId });
