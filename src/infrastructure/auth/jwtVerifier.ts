import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { readRequiredEnv } from '../config/env';
import { Principal, principalFromClaims } from './claims';

export interface JwtVerifierConfig {
  jwksUrl: string;
  issuer: string;
  audience: string;
}

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(
    readonly code: 'MISSING_TOKEN' | 'INVALID_TOKEN',
    message: string
  ) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function getJwtVerifierConfig(env: Record<string, string | undefined> = process.env): JwtVerifierConfig {
  return {
    jwksUrl: readRequiredEnv('JWT_JWKS_URL', env),
    issuer: readRequiredEnv('JWT_ISSUER', env),
    audience: readRequiredEnv('JWT_AUDIENCE', env),
  };
}

export function extractBearerToken(authorization: string | null | undefined): string {
  if (!authorization) {
    throw new UnauthorizedError('MISSING_TOKEN', 'Falta el header Authorization');
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) {
    throw new UnauthorizedError('INVALID_TOKEN', 'El header Authorization debe ser "Bearer <token>"');
  }

  return match[1];
}

export type VerifyFn = (token: string) => Promise<JWTPayload>;

// Verificador de producción: firma con JWKS (/.well-known/jwks.json del servicio User),
// iss y aud. `verify` se puede inyectar en tests.
export function createJwtVerifier(config: JwtVerifierConfig, verify?: VerifyFn): (authorization: string | null | undefined) => Promise<Principal> {
  const verifyToken: VerifyFn = verify ?? defaultVerifier(config);

  return async (authorization) => {
    const token = extractBearerToken(authorization);

    let payload: JWTPayload;
    try {
      payload = await verifyToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token inválido';
      throw new UnauthorizedError('INVALID_TOKEN', message);
    }

    try {
      return principalFromClaims(payload as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Claims inválidos';
      throw new UnauthorizedError('INVALID_TOKEN', message);
    }
  };
}

function defaultVerifier(config: JwtVerifierConfig): VerifyFn {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });
    return payload;
  };
}
