import { VeterinarySharingChecker } from '../VeterinarySharingChecker';
import { AccessDecision, IVeterinaryAccess } from '@/domain/interfaces/IVeterinaryAccess';

function accessReturning(decision: AccessDecision | null) {
  const getAccess = jest.fn(async () => decision);
  return { access: { getAccess } as unknown as IVeterinaryAccess, getAccess };
}

const ALLOWED: AccessDecision = {
  hasAccess: true,
  veterinaryStatus: 'ACTIVE',
  employeeId: 'emp-1',
  role: 'OWNER',
  licensed: true,
  permissions: [],
};

describe('VeterinarySharingChecker', () => {
  it('consulta el acceso con la sonda y devuelve true si hasAccess es true', async () => {
    const { access, getAccess } = accessReturning(ALLOWED);
    const checker = new VeterinarySharingChecker(access, 'probe-user');

    expect(await checker.isSharedWithClinic('vet-1', 'pet-1')).toBe(true);
    expect(getAccess).toHaveBeenCalledWith('vet-1', 'pet-1', 'probe-user');
  });

  it('devuelve false si hasAccess es false', async () => {
    const { access } = accessReturning({ ...ALLOWED, hasAccess: false });
    expect(await new VeterinarySharingChecker(access, 'probe-user').isSharedWithClinic('vet-1', 'pet-1')).toBe(false);
  });

  it('devuelve false si Veterinary no conoce la clínica o la mascota (null)', async () => {
    const { access } = accessReturning(null);
    expect(await new VeterinarySharingChecker(access, 'probe-user').isSharedWithClinic('vet-1', 'pet-1')).toBe(false);
  });
});
