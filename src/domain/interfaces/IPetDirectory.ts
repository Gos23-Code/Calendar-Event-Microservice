// Datos básicos de mascotas desde Pets (nombre y dueño). La fuente de verdad es Pets.
export interface PetSummary {
  id: string;
  name: string;
  ownerId: string | null;
}

export interface IPetDirectory {
  // Devuelve solo las mascotas que Pets conoce; las ausentes no aparecen en el Map.
  getPets(ids: string[]): Promise<Map<string, PetSummary>>;
}
