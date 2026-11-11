import { AppError } from '@/domain/errors/AppError';
import { VeterinaryAccessClient } from '../VeterinaryAccessClient';

const BASE = 'https://vet.example';
const ACCESS_OK = {
  hasAccess: true,
  veterinaryStatus: 'ACTIVE',
  employeeId: 'emp-1',
  role: 'VETERINARIAN',
  licensed: true,
  permissions: ['APPOINTMENT_MANAGE', 'CLINICAL_READ'],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeClient(fetchImpl: jest.Mock, extra: Partial<ConstructorParameters<typeof VeterinaryAccessClient>[0]> = {}) {
  return new VeterinaryAccessClient({
    baseUrl: BASE,
    apiKey: 'clave-interna',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...extra,
  });
}

describe('VeterinaryAccessClient', () => {
  it('llama al endpoint de acceso con la clave interna y devuelve la decisión', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, ACCESS_OK));
    const client = makeClient(fetchImpl);

    const decision = await client.getAccess('vet-1', 'pet-1', 'user-1');

    expect(decision).toEqual(ACCESS_OK);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/internal/veterinaries/vet-1/patients/pet-1/access?userId=user-1`);
    expect(init.headers).toEqual({ 'X-Internal-Api-Key': 'clave-interna' });
  });

  it('codifica los ids en la URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, ACCESS_OK));
    await makeClient(fetchImpl).getAccess('vet 1', 'pet/1', 'user+1@x');

    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${BASE}/internal/veterinaries/vet%201/patients/pet%2F1/access?userId=user%2B1%40x`
    );
  });

  it('cachea 60 s por (vet, mascota, usuario) y vuelve a consultar después', async () => {
    let clock = 1_000_000;
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, ACCESS_OK));
    const client = makeClient(fetchImpl, { now: () => clock });

    await client.getAccess('vet-1', 'pet-1', 'user-1');
    await client.getAccess('vet-1', 'pet-1', 'user-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 59_000;
    await client.getAccess('vet-1', 'pet-1', 'user-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await client.getAccess('vet-1', 'pet-1', 'user-1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('la caché no mezcla usuarios distintos', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, ACCESS_OK));
    const client = makeClient(fetchImpl);

    await client.getAccess('vet-1', 'pet-1', 'user-1');
    await client.getAccess('vet-1', 'pet-1', 'user-2');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('hasAccess = false se devuelve tal cual (no es un error)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { ...ACCESS_OK, hasAccess: false, permissions: [] }));
    const decision = await makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1');
    expect(decision?.hasAccess).toBe(false);
  });

  it('404 de Veterinary → null (clínica o mascota inexistente)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(404, {}));
    await expect(makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1')).resolves.toBeNull();
  });

  it('un 404 no se cachea: la siguiente llamada vuelve a consultar', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, ACCESS_OK));
    const client = makeClient(fetchImpl);

    await expect(client.getAccess('vet-1', 'pet-1', 'user-1')).resolves.toBeNull();
    await expect(client.getAccess('vet-1', 'pet-1', 'user-1')).resolves.toEqual(ACCESS_OK);
  });

  it('error de red → 503 SERVICE_UNAVAILABLE', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const promise = makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1');

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('respuesta 500 de Veterinary → 503 (no se deja pasar)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('timeout de 3 s (configurable) → 503', async () => {
    // fetch que nunca responde, pero respeta la señal de cancelación
    const fetchImpl = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const client = makeClient(fetchImpl, { timeoutMs: 10 });

    await expect(client.getAccess('vet-1', 'pet-1', 'user-1')).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('respuesta con forma inesperada → 503 (no se confía en el cuerpo)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { hasAccess: 'sí' }));
    await expect(makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('cuerpo que no es JSON → 503', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    await expect(makeClient(fetchImpl).getAccess('vet-1', 'pet-1', 'user-1')).rejects.toMatchObject({
      status: 503,
    });
  });
});
