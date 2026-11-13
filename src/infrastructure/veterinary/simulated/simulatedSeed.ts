import seedJson from './seed.json';

// Forma de la semilla de prueba (seed.json).
export interface SeedService {
  serviceId: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresLicense: boolean;
  eligibleEmployeeIds: string[];
}

export interface SeedPet {
  petId: string;
  ownerUserId: string | null;
}

export interface SeedStaff {
  userId: string;
  permissions: string[];
}

export interface SimulatedSeed {
  vetId: string;
  clinicName: string;
  ownerUserId: string;
  clinic: {
    status: 'ACTIVE' | 'INACTIVE';
    allowOnlineBooking: boolean;
    bookingRequiresConfirmation: boolean;
    cancellationMinHours: number;
    timezone: string;
  };
  staff: SeedStaff[];
  services: SeedService[];
  pets: SeedPet[];
  sharedPetIds: string[];
}

// Carga la semilla. Las variables SIM_VET_ID, SIM_OWNER_USER_ID y SIM_CLINIC_USER_ID permiten
// apuntar la demo a una clínica, un dueño y un empleado reales de tus pruebas locales.
export function loadSimulatedSeed(env: Record<string, string | undefined> = process.env): SimulatedSeed {
  const raw = seedJson as SimulatedSeed;

  const vetId = env.SIM_VET_ID && env.SIM_VET_ID.length > 0 ? env.SIM_VET_ID : raw.vetId;
  const ownerUserId =
    env.SIM_OWNER_USER_ID && env.SIM_OWNER_USER_ID.length > 0 ? env.SIM_OWNER_USER_ID : raw.ownerUserId;
  const clinicUserId = env.SIM_CLINIC_USER_ID && env.SIM_CLINIC_USER_ID.length > 0 ? env.SIM_CLINIC_USER_ID : null;

  return {
    ...raw,
    vetId,
    ownerUserId,
    staff: raw.staff.map((s, index) => ({
      ...s,
      userId: index === 0 && clinicUserId ? clinicUserId : s.userId,
    })),
    pets: raw.pets.map((p) => ({
      ...p,
      ownerUserId: p.ownerUserId === raw.ownerUserId ? ownerUserId : p.ownerUserId,
    })),
  };
}
