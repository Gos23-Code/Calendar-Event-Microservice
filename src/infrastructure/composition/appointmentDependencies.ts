import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readRequiredEnv } from '../config/env';
import { createJwtVerifier, getJwtVerifierConfig } from '../auth/jwtVerifier';
import { getInternalApiKey } from '../auth/internalApiKey';
import { SupabaseAppointmentRepository } from '../database/supabase/SupabaseAppointmentRepository';
import { SimulatedScheduleRulesProvider } from '../veterinary/SimulatedScheduleRulesProvider';
import { VeterinaryAccessClient } from '../veterinary/VeterinaryAccessClient';
import { PetsClient } from '../pets/PetsClient';
import { IPetDirectory } from '@/domain/interfaces/IPetDirectory';
import { VeterinarySharingChecker } from '../veterinary/VeterinarySharingChecker';

// Timeout opcional por variable de entorno (ms). Sin valor válido, cada cliente usa su default (3 s,
// el del contrato). Sirve para entornos con Cloud Run en escala a cero, donde el arranque en frío tarda más.
function optionalTimeoutMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
import {
  SimulatedClinicConfigProvider,
  SimulatedPetAccessProvider,
  SimulatedServiceCatalog,
} from '../veterinary/simulated/SimulatedVeterinaryDirectory';
import { SimulatedStaffDirectory } from '../veterinary/simulated/SimulatedStaffDirectory';
import { loadSimulatedSeed } from '../veterinary/simulated/simulatedSeed';
import { PubSubAppointmentPublisher, appointmentsTopicName } from '../events/PubSubAppointmentPublisher';
import { pubSubClient } from '../pubsub/client';
import { CreateClinicAppointmentUseCase } from '@/application/use-cases/CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '@/application/use-cases/RequestAppointmentUseCase';
import { AppointmentLifecycleUseCase } from '@/application/use-cases/AppointmentLifecycleUseCase';
import {
  ClinicAgendaUseCase,
  OwnerAppointmentsUseCase,
} from '@/application/use-cases/AppointmentQueriesUseCase';
import { SendAppointmentRemindersUseCase } from '@/application/use-cases/SendAppointmentRemindersUseCase';
import { AppointmentNotifier } from '@/application/services/AppointmentNotifier';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';
import { Principal } from '@/domain/entities/Principal';

// Composición de dependencias del servidor. Este archivo es el ÚNICO que conoce la clave
// service_role. Solo se usa desde route handlers (nunca desde el cliente).

export type AuthenticateFn = (authorization: string | null | undefined) => Promise<Principal>;

export interface AppointmentHttpDeps {
  authenticate: AuthenticateFn;
  clinicUseCase: CreateClinicAppointmentUseCase;
  requestUseCase: RequestAppointmentUseCase;
  lifecycle: AppointmentLifecycleUseCase;
  agenda: ClinicAgendaUseCase;
  owner: OwnerAppointmentsUseCase;
  reminders: SendAppointmentRemindersUseCase;
  internalApiKey: string;
  petDirectory: IPetDirectory; // nombres de mascotas desde Pets (petName en cada cita)
}

// supabase-js necesita la URL base. Si viene con /rest/v1 (como la URL de la API REST), se quita.
export function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}

export function createServiceSupabaseClient(env: Record<string, string | undefined> = process.env): SupabaseClient {
  const url = normalizeSupabaseUrl(readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', env));
  const serviceKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', env);
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// EVENTS_ENABLED=true activa la publicación real en Pub/Sub. Por defecto está apagado.
export function eventsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.EVENTS_ENABLED ?? '').trim() === 'true';
}

function buildPublisher(env: Record<string, string | undefined>): IAppointmentEventPublisher {
  if (eventsEnabled(env)) {
    return new PubSubAppointmentPublisher(pubSubClient, appointmentsTopicName(env));
  }
  // Con los eventos apagados el notificador no llama al publicador; este stub solo existe por tipo.
  return {
    publish: async () => {
      throw new Error('Eventos de cita deshabilitados (EVENTS_ENABLED no es true)');
    },
  };
}

let cached: AppointmentHttpDeps | null = null;

// Construye las dependencias una sola vez, al primer request (no al importar el módulo,
// para que `next build` no falle si faltan variables).
export function getAppointmentHttpDeps(env: Record<string, string | undefined> = process.env): AppointmentHttpDeps {
  if (cached) return cached;

  const db = createServiceSupabaseClient(env);
  const seed = loadSimulatedSeed(env);
  const internalApiKey = getInternalApiKey(env);

  const shared = {
    rules: new SimulatedScheduleRulesProvider(),
    appointments: new SupabaseAppointmentRepository(db),
    catalog: new SimulatedServiceCatalog(seed),
    pets: new SimulatedPetAccessProvider(seed),
    clinicConfig: new SimulatedClinicConfigProvider(seed),
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  };

  const access = new VeterinaryAccessClient({
    baseUrl: readRequiredEnv('VETERINARY_SERVICE_URL', env),
    apiKey: internalApiKey,
    timeoutMs: optionalTimeoutMs(env.VETERINARY_TIMEOUT_MS),
  });

  // Compartición con la clínica: provisional, vía Veterinary con un empleado activo como sonda (SIM_CLINIC_USER_ID).
  const sharing = env.SIM_CLINIC_USER_ID
    ? new VeterinarySharingChecker(access, env.SIM_CLINIC_USER_ID)
    : undefined;

  const pets = new PetsClient({
    baseUrl: readRequiredEnv('PETS_SERVICE_URL', env),
    apiKey: internalApiKey,
    timeoutMs: optionalTimeoutMs(env.PETS_TIMEOUT_MS),
  });

  const staff = new SimulatedStaffDirectory(seed);

  const notifier = new AppointmentNotifier({
    publisher: buildPublisher(env),
    clinicConfig: shared.clinicConfig,
    pets: shared.pets,
    newId: shared.newId,
    now: shared.now,
    enabled: eventsEnabled(env),
  });

  cached = {
    authenticate: createJwtVerifier(getJwtVerifierConfig(env)),
    clinicUseCase: new CreateClinicAppointmentUseCase({ ...shared, access, notifier }),
    requestUseCase: new RequestAppointmentUseCase({ ...shared, notifier, ownership: pets, sharing }),
    lifecycle: new AppointmentLifecycleUseCase({
      appointments: shared.appointments,
      access,
      clinicConfig: shared.clinicConfig,
      rules: shared.rules,
      catalog: shared.catalog,
      now: shared.now,
      notifier,
    }),
    agenda: new ClinicAgendaUseCase({ appointments: shared.appointments, staff }),
    owner: new OwnerAppointmentsUseCase({ appointments: shared.appointments, clinicConfig: shared.clinicConfig }),
    reminders: new SendAppointmentRemindersUseCase({
      appointments: shared.appointments,
      notifier,
      now: shared.now,
    }),
    internalApiKey,
    petDirectory: pets,
  };
  return cached;
}
