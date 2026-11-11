import { ClinicConfig, IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IPetAccessProvider, PetInfo } from '@/domain/interfaces/IPetAccessProvider';
import { IServiceCatalog, ServiceInfo } from '@/domain/interfaces/IServiceCatalog';
import { loadSimulatedSeed, SimulatedSeed } from './simulatedSeed';

// ⚠️ SIMULADOS con la semilla seed.json. Reemplazar por los clientes reales de Veterinary/Pets (Fase 5).

export class SimulatedClinicConfigProvider implements IClinicConfigProvider {
  constructor(private readonly seed: SimulatedSeed = loadSimulatedSeed()) {}

  async get(veterinaryId: string): Promise<ClinicConfig | null> {
    if (veterinaryId !== this.seed.vetId) return null;
    return { veterinaryId, ...this.seed.clinic };
  }
}

export class SimulatedServiceCatalog implements IServiceCatalog {
  constructor(private readonly seed: SimulatedSeed = loadSimulatedSeed()) {}

  async get(veterinaryId: string, serviceId: string): Promise<ServiceInfo | null> {
    if (veterinaryId !== this.seed.vetId) return null;
    const service = this.seed.services.find((s) => s.serviceId === serviceId);
    if (!service) return null;
    return {
      serviceId: service.serviceId,
      name: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
      requiresLicense: service.requiresLicense,
      eligibleEmployeeIds: [...service.eligibleEmployeeIds],
    };
  }
}

export class SimulatedPetAccessProvider implements IPetAccessProvider {
  constructor(private readonly seed: SimulatedSeed = loadSimulatedSeed()) {}

  async getPet(petId: string): Promise<PetInfo | null> {
    const pet = this.seed.pets.find((p) => p.petId === petId);
    return pet ? { petId: pet.petId, ownerUserId: pet.ownerUserId } : null;
  }

  async isSharedWithClinic(petId: string, veterinaryId: string): Promise<boolean> {
    return veterinaryId === this.seed.vetId && this.seed.sharedPetIds.includes(petId);
  }
}
