// Configuración de reservas de una clínica (pendiente de Veterinary, dependencia 2 de la Fase 5).
export interface ClinicConfig {
  veterinaryId: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  allowOnlineBooking: boolean;
  bookingRequiresConfirmation: boolean;
  cancellationMinHours: number;
  timezone: string;
}

export interface IClinicConfigProvider {
  get(veterinaryId: string): Promise<ClinicConfig | null>;
}
