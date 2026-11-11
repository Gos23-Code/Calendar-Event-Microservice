// Validación de claims del JWT (CAL-01 / CAL-02).
// Pura: no hace red ni depende de jose, así se prueba sin tocar JWKS.

import { Principal } from '@/domain/entities/Principal';

export type { Principal, TokenContext } from '@/domain/entities/Principal';

export class InvalidClaimsError extends Error {
  readonly code = 'INVALID_TOKEN_CLAIMS';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidClaimsError';
  }
}

type Claims = Record<string, unknown>;

function requireString(claims: Claims, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidClaimsError(`Claim ${name} ausente o inválido`);
  }
  return value;
}

export function principalFromClaims(claims: Claims): Principal {
  const ctx = claims.ctx;
  const userId = requireString(claims, 'sub');

  if (ctx === 'USER') {
    return { kind: 'USER', userId };
  }

  if (ctx === 'VETERINARY') {
    if (typeof claims.vet_licensed !== 'boolean') {
      throw new InvalidClaimsError('Claim vet_licensed ausente o inválido');
    }

    return {
      kind: 'VETERINARY',
      userId,
      vetId: requireString(claims, 'vet_id'),
      vetRole: requireString(claims, 'vet_role'),
      employeeId: requireString(claims, 'employee_id'),
      vetLicensed: claims.vet_licensed,
      vetStatus: requireString(claims, 'vet_status'),
    };
  }

  throw new InvalidClaimsError(`Claim ctx inválido: ${String(ctx)}`);
}
