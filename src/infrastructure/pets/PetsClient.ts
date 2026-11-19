import { AppError } from '@/domain/errors/AppError';
import { IPetOwnershipProvider } from '@/domain/interfaces/IPetOwnershipProvider';
import { IPetDirectory, PetSummary } from '@/domain/interfaces/IPetDirectory';

// Cliente HTTP del endpoint interno de Pets: GET /internal/pets/{petId}/owner/{userId} → { "isOwner": boolean }
// - Header X-Internal-Api-Key
// - Timeout de 3 s; si Pets no responde → 503 (nunca "dejar pasar")

export const PETS_API_KEY_HEADER_NAME = 'X-Internal-Api-Key';
export const PETS_DEFAULT_TIMEOUT_MS = 3000;

export interface PetsClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function unavailable(message: string): AppError {
  return new AppError(503, 'SERVICE_UNAVAILABLE', message);
}

export class PetsClient implements IPetOwnershipProvider, IPetDirectory {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: PetsClientOptions) {
    this.timeoutMs = options.timeoutMs ?? PETS_DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async isOwner(petId: string, userId: string): Promise<boolean> {
    const url =
      `${this.options.baseUrl}/internal/pets/${encodeURIComponent(petId)}` +
      `/owner/${encodeURIComponent(userId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { [PETS_API_KEY_HEADER_NAME]: this.options.apiKey },
        signal: controller.signal,
      });
    } catch {
      throw unavailable('Pets no respondió a tiempo');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw unavailable(`Pets respondió con estado ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw unavailable('Respuesta inválida de Pets');
    }

    const isOwner = (body as { isOwner?: unknown } | null)?.isOwner;
    if (typeof isOwner !== 'boolean') {
      throw unavailable('Respuesta inválida de Pets');
    }
    return isOwner;
  }

  // POST /internal/pets/batch con { ids } → [{ id, name, ownerId, ... }]. Las mascotas que Pets no conoce no vienen.
  async getPets(ids: string[]): Promise<Map<string, PetSummary>> {
    const unique = [...new Set(ids)];
    const result = new Map<string, PetSummary>();
    if (unique.length === 0) {
      return result;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/internal/pets/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [PETS_API_KEY_HEADER_NAME]: this.options.apiKey,
        },
        body: JSON.stringify({ ids: unique }),
        signal: controller.signal,
      });
    } catch {
      throw unavailable('Pets no respondió a tiempo');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw unavailable(`Pets respondió con estado ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw unavailable('Respuesta inválida de Pets');
    }
    if (!Array.isArray(body)) {
      throw unavailable('Respuesta inválida de Pets');
    }

    for (const item of body as Array<Record<string, unknown>>) {
      if (typeof item.id !== 'string' || typeof item.name !== 'string') {
        throw unavailable('Respuesta inválida de Pets');
      }
      result.set(item.id, {
        id: item.id,
        name: item.name,
        ownerId: typeof item.ownerId === 'string' ? item.ownerId : null,
      });
    }
    return result;
  }
}
