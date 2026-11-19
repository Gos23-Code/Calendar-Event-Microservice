// ¿Esta mascota está compartida con esta clínica? La fuente de verdad es Veterinary.
export interface IPetSharingProvider {
  isSharedWithClinic(veterinaryId: string, petId: string): Promise<boolean>;
}
