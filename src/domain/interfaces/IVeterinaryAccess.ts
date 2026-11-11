// Decisión de acceso de Veterinary sobre una mascota (CONTRATOS_COMPARTIDOS.md, sección 3).
// Veterinary es la única fuente de verdad sobre permisos: Calendar no duplica la tabla.
export interface AccessDecision {
  hasAccess: boolean; // false si no es empleado activo, la clínica no está ACTIVE o la mascota no está compartida
  veterinaryStatus: string;
  employeeId: string;
  role: string;
  licensed: boolean;
  permissions: string[];
}

export interface IVeterinaryAccess {
  // null = la clínica o la mascota no existen en Veterinary
  getAccess(veterinaryId: string, petId: string, userId: string): Promise<AccessDecision | null>;
}
