import { PetsClient } from '../PetsClient';
import { AppError } from '@/domain/errors/AppError';

const BASE = 'https://pets.example.test';
const PET = 'pet-1';
const USER = 'user-1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeClient(fetchImpl: typeof fetch, timeoutMs?: number) {
  return new PetsClient({ baseUrl: BASE, apiKey: 'clave-secreta', fetchImpl, timeoutMs });
}

describe('PetsClient.isOwner', () => {
  it('llama al endpoint interno con la clave y devuelve true si es dueño', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ isOwner: true }));
    const result = await makeClient(fetchImpl as unknown as typeof fetch).isOwner(PET, USER);

    expect(result).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/internal/pets/${PET}/owner/${USER}`);
    expect((init.headers as Record<string, string>)['X-Internal-Api-Key']).toBe('clave-secreta');
  });

  it('devuelve false si no es dueño', async () => {
    const fetchImpl = async () => jsonResponse({ isOwner: false });
    expect(await makeClient(fetchImpl).isOwner(PET, USER)).toBe(false);
  });

  it('responde 503 si Pets devuelve un estado de error', async () => {
    const fetchImpl = async () => new Response('x', { status: 500 });
    await expect(makeClient(fetchImpl).isOwner(PET, USER)).rejects.toMatchObject({ status: 503 });
  });

  it('responde 503 si Pets no responde a tiempo', async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const error = await makeClient(fetchImpl as unknown as typeof fetch, 10)
      .isOwner(PET, USER)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(503);
  });

  it('responde 503 si el cuerpo no trae isOwner booleano', async () => {
    const fetchImpl = async () => jsonResponse({ otra: 'cosa' });
    await expect(makeClient(fetchImpl).isOwner(PET, USER)).rejects.toMatchObject({ status: 503 });
  });
});
