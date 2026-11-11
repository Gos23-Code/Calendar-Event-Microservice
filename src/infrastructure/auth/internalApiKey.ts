import { createHash, timingSafeEqual } from 'crypto';
import { readRequiredEnv } from '../config/env';

// Header que usan los endpoints /internal/** y los jobs (Cloud Scheduler).
export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

export function getInternalApiKey(env: Record<string, string | undefined> = process.env): string {
  return readRequiredEnv('INTERNAL_API_KEY', env);
}

// Comparación en tiempo constante. Se comparan los hash SHA-256 para que ambos
// buffers tengan siempre el mismo largo y no se filtre la longitud de la clave.
export function isValidInternalApiKey(provided: string | null | undefined, expected: string): boolean {
  if (!provided) {
    return false;
  }

  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();

  return timingSafeEqual(providedDigest, expectedDigest);
}
