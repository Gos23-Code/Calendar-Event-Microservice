import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readRequiredEnv } from '../config/env';
import { createJwtVerifier, getJwtVerifierConfig } from '../auth/jwtVerifier';
import { SupabaseAppointmentRepository } from '../database/supabase/SupabaseAppointmentRepository';
import { SimulatedScheduleRulesProvider } from '../veterinary/SimulatedScheduleRulesProvider';
import { VeterinaryAccessClient } from '../veterinary/VeterinaryAccessClient';
import {
  SimulatedClinicConfigProvider,
  SimulatedPetAccessProvider,
  SimulatedServiceCatalog,
} from '../veterinary/simulated/SimulatedVeterinaryDirectory';
import { SimulatedStaffDirectory } from '../veterinary/simulated/SimulatedStaffDirectory';
import { loadSimulatedSeed } from '../veterinary/simulated/simulatedSeed';
import { CreateClinicAppointmentUseCase } from '@/application/use-cases/CreateClinicAppointmentUseCase';
import { RequestAppointmentUseCase } from '@/application/use-cases/RequestAppointmentUseCase';
import { AppointmentLifecycleUseCase } from '@/application/use-cases/AppointmentLifecycleUseCase';
import {
  ClinicAgendaUseCase,
  OwnerAppointmentsUseCase,
} from '@/application/use-cases/AppointmentQueriesUseCase';
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

let cached: AppointmentHttpDeps | null = null;

// Construye las dependencias una sola vez, al primer request (no al importar el módulo,
// para que `next build` no falle si faltan variables).
export function getAppointmentHttpDeps(env: Record<string, string | undefined> = process.env): AppointmentHttpDeps {
  if (cached) return cached;

  const db = createServiceSupabaseClient(env);
  const seed = loadSimulatedSeed(env);

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
    apiKey: readRequiredEnv('INTERNAL_API_KEY', env),
  });

  const staff = new SimulatedStaffDirectory(seed);

  cached = {
    authenticate: createJwtVerifier(getJwtVerifierConfig(env)),
    clinicUseCase: new CreateClinicAppointmentUseCase({ ...shared, access }),
    requestUseCase: new RequestAppointmentUseCase(shared),
    lifecycle: new AppointmentLifecycleUseCase({
      appointments: shared.appointments,
      access,
      clinicConfig: shared.clinicConfig,
      rules: shared.rules,
      catalog: shared.catalog,
      now: shared.now,
    }),
    agenda: new ClinicAgendaUseCase({ appointments: shared.appointments, staff }),
    owner: new OwnerAppointmentsUseCase({ appointments: shared.appointments, clinicConfig: shared.clinicConfig }),
  };
  return cached;
}
