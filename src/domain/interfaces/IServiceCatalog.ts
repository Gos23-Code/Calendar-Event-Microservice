// Catálogo de servicios de una clínica. Lo define cada clínica en Veterinary (Fase 5):
// duración, precio, si exige licencia y qué empleados pueden prestarlo.
export interface ServiceInfo {
  serviceId: string;
  name: string;
  durationMinutes: number;
  price: number | null;
  requiresLicense: boolean;
  eligibleEmployeeIds: string[]; // solo estos empleados ofrecen franjas para el servicio
}

export interface IServiceCatalog {
  get(veterinaryId: string, serviceId: string): Promise<ServiceInfo | null>;
}
