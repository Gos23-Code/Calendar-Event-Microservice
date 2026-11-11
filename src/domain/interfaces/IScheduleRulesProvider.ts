import { ScheduleRules } from '../services/availability';

// Puerto para obtener las reglas de agenda de una clínica (horario, empleados y bloqueos).
// La implementación real llama a Veterinary (GET /internal/veterinaries/{id}/schedule-rules);
// por ahora existe una implementación simulada en infrastructure.
export interface GetScheduleRulesQuery {
  veterinaryId: string;
  from: Date;
  to: Date; // exclusivo
  employeeId?: string;
}

export interface IScheduleRulesProvider {
  getScheduleRules(query: GetScheduleRulesQuery): Promise<ScheduleRules>;
}
