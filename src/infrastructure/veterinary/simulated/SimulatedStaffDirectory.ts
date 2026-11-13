import { IStaffDirectory } from '@/domain/interfaces/IStaffDirectory';
import { loadSimulatedSeed, SimulatedSeed } from './simulatedSeed';

// ⚠️ SIMULADO: permisos de personal sin mascota (dependencia 3 de la Fase 5).
export class SimulatedStaffDirectory implements IStaffDirectory {
  constructor(private readonly seed: SimulatedSeed = loadSimulatedSeed()) {}

  async getPermissions(veterinaryId: string, userId: string): Promise<string[] | null> {
    if (veterinaryId !== this.seed.vetId) return null;
    const member = this.seed.staff.find((s) => s.userId === userId);
    return member ? [...member.permissions] : null;
  }
}
