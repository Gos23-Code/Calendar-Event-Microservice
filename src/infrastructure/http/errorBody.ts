// Formato de error común (CONTRATOS_COMPARTIDOS.md, sección 5):
// { timestamp, status, error, message } + code (para que el frontend decida por code).

const REASON_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export interface ErrorBody {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  code: string;
}

interface HttpLikeError {
  status: number;
  code: string;
  message: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  return typeof e.status === 'number' && typeof e.code === 'string' && typeof e.message === 'string';
}

// Convierte cualquier error en { status, body }. Los errores desconocidos no
// exponen su mensaje interno: responden 500 INTERNAL_ERROR.
export function toErrorResponse(error: unknown, now: Date): { status: number; body: ErrorBody } {
  if (isHttpLikeError(error)) {
    return {
      status: error.status,
      body: {
        timestamp: now.toISOString(),
        status: error.status,
        error: REASON_PHRASES[error.status] ?? 'Error',
        message: error.message,
        code: error.code,
      },
    };
  }

  return {
    status: 500,
    body: {
      timestamp: now.toISOString(),
      status: 500,
      error: REASON_PHRASES[500],
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    },
  };
}
