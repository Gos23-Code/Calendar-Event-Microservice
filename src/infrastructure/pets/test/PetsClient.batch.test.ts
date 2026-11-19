import { PetsClient } from '../PetsClient';
import { AppError } from '@/domain/errors/AppError';

const BASE = 'https://pets.example.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeClient(fetchImpl: typeof fetch) {
  return new PetsClient({ baseUrl: BASE, apiKey: 'clave-secreta', fetchImpl });
}

describe('PetsClient.getPets (POST /internal/pets/batch)', () => {
  it('envía los ids con la clave y devuelve nombre y dueño por mascota', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse([{ id: 'pet-1', name: 'Toby', ownerId: 'owner-1', species: 'Perro' }])
    );
    const result = await makeClient(fetchImpl as unknown as typeof fetch).getPets(['pet-1']);

    expect(result.get('pet-1')).toEqual({ id: 'pet-1', name: 'Toby', ownerId: 'owner-1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/internal/pets/batch`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['pet-1'] });
    expect((init.headers as Record<string, string>)['X-Internal-Api-Key']).toBe('clave-secreta');
  });

  it('sin ids no llama a Pets', async () => {
    const fetchImpl = jest.fn();
    const result = await makeClient(fetchImpl as unknown as typeof fetch).getPets([]);
    expect(result.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('quita ids repetidos antes de llamar', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse([]));
    await makeClient(fetchImpl as unknown as typeof fetch).getPets(['pet-1', 'pet-1']);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['pet-1'] });
  });

  it('una mascota que Pets no conoce no aparece en el resultado', async () => {
    const fetchImpl = async () => jsonResponse([]);
    const result = await makeClient(fetchImpl).getPets(['desconocida']);
    expect(result.has('desconocida')).toBe(false);
  });

  it('responde 503 si Pets devuelve error', async () => {
    const fetchImpl = async () => new Response('x', { status: 500 });
    await expect(makeClient(fetchImpl).getPets(['pet-1'])).rejects.toMatchObject({ status: 503 });
  });

  it('responde 503 si Pets no responde a tiempo', async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = new PetsClient({ baseUrl: BASE, apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    const error = await client.getPets(['pet-1']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(503);
  });

  it('responde 503 si la respuesta no es una lista válida', async () => {
    const fetchImpl = async () => jsonResponse({ no: 'lista' });
    await expect(makeClient(fetchImpl).getPets(['pet-1'])).rejects.toMatchObject({ status: 503 });
  });
});
