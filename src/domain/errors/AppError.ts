// Error de aplicación con código HTTP y código estable para el frontend.
// Formato de respuesta: { timestamp, status, error, message, code } (CONTRATOS_COMPARTIDOS.md).
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 503,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}
