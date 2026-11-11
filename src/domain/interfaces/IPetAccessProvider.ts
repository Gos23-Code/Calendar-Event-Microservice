// Acceso a mascotas: dueño de una mascota (Pets) y si está compartida con una clínica
// (pendiente de definir, dependencia 6 de la Fase 5).
export interface PetInfo {
  petId: string;
  ownerUserId: string | null; // null = el dueño no tiene app
}

export interface IPetAccessProvider {
  getPet(petId: string): Promise<PetInfo | null>;
  isSharedWithClinic(petId: string, veterinaryId: string): Promise<boolean>;
}
