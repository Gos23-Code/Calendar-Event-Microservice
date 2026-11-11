import {
  createJwtVerifier,
  extractBearerToken,
  getJwtVerifierConfig,
  UnauthorizedError,
} from '../jwtVerifier';

const config = {
  jwksUrl: 'https://user-service.example/.well-known/jwks.json',
  issuer: 'myanimalog-user-service',
  audience: 'myanimalog-api',
};

describe('extractBearerToken', () => {
  it('extrae el token de "Bearer <token>"', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('acepta "bearer" en minúsculas', () => {
    expect(extractBearerToken('bearer abc')).toBe('abc');
  });

  it('falla con MISSING_TOKEN si no hay header', () => {
    expect(() => extractBearerToken(null)).toThrow(UnauthorizedError);
    try {
      extractBearerToken(undefined);
    } catch (error) {
      expect((error as UnauthorizedError).code).toBe('MISSING_TOKEN');
      expect((error as UnauthorizedError).status).toBe(401);
    }
  });

  it('falla con INVALID_TOKEN si el formato no es Bearer', () => {
    expect(() => extractBearerToken('Basic abc')).toThrow(UnauthorizedError);
    expect(() => extractBearerToken('Bearer')).toThrow(UnauthorizedError);
  });
});

describe('createJwtVerifier', () => {
  it('devuelve el principal cuando la verificación y los claims son válidos', async () => {
    const verify = jest.fn().mockResolvedValue({ sub: 'owner-1', ctx: 'USER' });
    const verifier = createJwtVerifier(config, verify);

    await expect(verifier('Bearer token-ok')).resolves.toEqual({ kind: 'USER', userId: 'owner-1' });
    expect(verify).toHaveBeenCalledWith('token-ok');
  });

  it('responde INVALID_TOKEN cuando la firma, iss o aud fallan', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('signature verification failed'));
    const verifier = createJwtVerifier(config, verify);

    await expect(verifier('Bearer token-malo')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      status: 401,
    });
  });

  it('responde INVALID_TOKEN cuando los claims no cumplen el contrato', async () => {
    const verify = jest.fn().mockResolvedValue({ sub: 'x', ctx: 'ADMIN' });
    const verifier = createJwtVerifier(config, verify);

    await expect(verifier('Bearer token-raro')).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      status: 401,
    });
  });

  it('no llama a la verificación si falta el header', async () => {
    const verify = jest.fn();
    const verifier = createJwtVerifier(config, verify);

    await expect(verifier(null)).rejects.toMatchObject({ code: 'MISSING_TOKEN' });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('getJwtVerifierConfig', () => {
  it('lee las tres variables', () => {
    expect(
      getJwtVerifierConfig({
        JWT_JWKS_URL: config.jwksUrl,
        JWT_ISSUER: config.issuer,
        JWT_AUDIENCE: config.audience,
      })
    ).toEqual(config);
  });

  it('falla si falta una variable', () => {
    expect(() =>
      getJwtVerifierConfig({ JWT_ISSUER: 'x', JWT_AUDIENCE: 'y' })
    ).toThrow(/JWT_JWKS_URL/);
  });
});
