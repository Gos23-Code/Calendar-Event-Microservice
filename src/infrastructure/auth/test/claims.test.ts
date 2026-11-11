import { InvalidClaimsError, principalFromClaims } from '../claims';

const vetClaims = {
  sub: 'user-1',
  ctx: 'VETERINARY',
  vet_id: 'vet-1',
  vet_role: 'VET',
  employee_id: 'emp-1',
  vet_licensed: true,
  vet_status: 'ACTIVE',
};

describe('principalFromClaims', () => {
  it('token base (ctx=USER) devuelve un principal de dueño', () => {
    expect(principalFromClaims({ sub: 'owner-1', ctx: 'USER' })).toEqual({
      kind: 'USER',
      userId: 'owner-1',
    });
  });

  it('token de clínica (ctx=VETERINARY) devuelve todos sus claims', () => {
    expect(principalFromClaims(vetClaims)).toEqual({
      kind: 'VETERINARY',
      userId: 'user-1',
      vetId: 'vet-1',
      vetRole: 'VET',
      employeeId: 'emp-1',
      vetLicensed: true,
      vetStatus: 'ACTIVE',
    });
  });

  it('rechaza un ctx desconocido', () => {
    expect(() => principalFromClaims({ sub: 'x', ctx: 'ADMIN' })).toThrow(InvalidClaimsError);
  });

  it('rechaza un token sin sub', () => {
    expect(() => principalFromClaims({ ctx: 'USER' })).toThrow(/sub/);
  });

  it('rechaza un token de clínica sin vet_id', () => {
    expect(() => principalFromClaims({ ...vetClaims, vet_id: undefined })).toThrow(/vet_id/);
  });

  it('rechaza un token de clínica con vet_licensed que no es booleano', () => {
    expect(() => principalFromClaims({ ...vetClaims, vet_licensed: 'yes' })).toThrow(/vet_licensed/);
  });

  it('rechaza un sub que solo tiene espacios', () => {
    expect(() => principalFromClaims({ sub: '   ', ctx: 'USER' })).toThrow(InvalidClaimsError);
  });
});
