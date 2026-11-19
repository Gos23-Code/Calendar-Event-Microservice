import { IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';
import { IPetSharingProvider } from '@/domain/interfaces/IPetSharingProvider';

// PROVISIONAL. Veterinary aún no expone "mascota compartida con la clínica" para el servicio.
// Se deduce del endpoint de acceso: hasAccess = true exige que la mascota esté compartida con la clínica.
// Usa un empleado activo de la clínica como sonda (probeUserId). Reemplazar cuando exista el endpoint dedicado.
export class VeterinarySharingChecker implements IPetSharingProvider {
  constructor(
    private readonly access: IVeterinaryAccess,
    private readonly probeUserId: string
  ) {}

  async isSharedWithClinic(veterinaryId: string, petId: string): Promise<boolean> {
    const decision = await this.access.getAccess(veterinaryId, petId, this.probeUserId);
    return decision?.hasAccess === true;
  }
}
