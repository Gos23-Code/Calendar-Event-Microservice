import { AppError } from '@/domain/errors/AppError';
import { AccessDecision, IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';

// Cliente HTTP del endpoint interno de acceso de Veterinary (CONTRATOS_COMPARTIDOS.md, sección 2 y 3):
// - Header X-Internal-Api-Key
// - Timeout de 3 s; si Veterinary no responde → 503 (nunca "dejar pasar")
// - Cache de 60 s por (veterinaryId, petId, userId)

export const INTERNAL_API_KEY_HEADER_NAME = 'X-Internal-Api-Key';
export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_CACHE_TTL_MS = 60_000;

export interface VeterinaryAccessClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface CacheEntry {
  value: AccessDecision;
  expiresAt: number;
}

function unavailable(message: string): AppError {
  return new AppError(503, 'SERVICE_UNAVAILABLE', message);
}

function isAccessDecision(body: unknown): body is AccessDecision {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.hasAccess === 'boolean' &&
    typeof b.veterinaryStatus === 'string' &&
    typeof b.employeeId === 'string' &&
    typeof b.role === 'string' &&
    typeof b.licensed === 'boolean' &&
    Array.isArray(b.permissions) &&
    b.permissions.every((p) => typeof p === 'string')
  );
}

export class VeterinaryAccessClient implements IVeterinaryAccess {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: VeterinaryAccessClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async getAccess(veterinaryId: string, petId: string, userId: string): Promise<AccessDecision | null> {
    const key = `${veterinaryId}|${petId}|${userId}`;

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) {
      return cached.value;
    }

    const url =
      `${this.options.baseUrl}/internal/veterinaries/${encodeURIComponent(veterinaryId)}` +
      `/patients/${encodeURIComponent(petId)}/access?userId=${encodeURIComponent(userId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { [INTERNAL_API_KEY_HEADER_NAME]: this.options.apiKey },
        signal: controller.signal,
      });
    } catch {
      throw unavailable('Veterinary no respondió a tiempo');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw unavailable(`Veterinary respondió con estado ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw unavailable('Respuesta inválida de Veterinary');
    }
    if (!isAccessDecision(body)) {
      throw unavailable('Respuesta inválida de Veterinary');
    }

    this.cache.set(key, { value: body, expiresAt: this.now() + this.cacheTtlMs });
    return body;
  }
}
