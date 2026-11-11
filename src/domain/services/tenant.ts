import { AppError } from '../errors/AppError';

// Multi-tenant (CONTRATOS_COMPARTIDOS.md, 1.5):
// si el vet_id del token de clínica no coincide con la clínica de la ruta → 403.
export function assertSameVeterinary(principalVetId: string, routeVetId: string): void {
  if (principalVetId !== routeVetId) {
    throw new AppError(403, 'TENANT_MISMATCH', 'El token no corresponde a esta clínica');
  }
}

// Recurso que pertenece a otra clínica (CAL-02): → 404 para no revelar que existe.
// Se usará en las rutas por id (confirmar, reprogramar, cancelar, etc.).
export function assertResourceBelongsTo(resourceVetId: string, principalVetId: string): void {
  if (resourceVetId !== principalVetId) {
    throw new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');
  }
}
