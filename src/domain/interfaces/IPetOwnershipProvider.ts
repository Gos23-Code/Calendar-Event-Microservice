// ¿Esta mascota pertenece a este usuario? La fuente de verdad es el servicio Pets.
export interface IPetOwnershipProvider {
  isOwner(petId: string, userId: string): Promise<boolean>;
}
