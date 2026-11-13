// Permisos de un usuario dentro de una clínica, sin necesidad de una mascota.
// Lo necesita la agenda (CAL-05). Veterinary aún no expone este endpoint (dependencia 3 de la Fase 5);
// en local se simula. Devuelve null si el usuario no pertenece a la clínica.
export interface IStaffDirectory {
  getPermissions(veterinaryId: string, userId: string): Promise<string[] | null>;
}
