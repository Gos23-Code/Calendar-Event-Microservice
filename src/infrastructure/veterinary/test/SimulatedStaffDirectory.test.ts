import { SimulatedStaffDirectory } from '../simulated/SimulatedStaffDirectory';
import { loadSimulatedSeed } from '../simulated/simulatedSeed';

describe('loadSimulatedSeed — personal de la clínica', () => {
  it('sin variables, el miembro de demo es el usuario 5555…', () => {
    expect(loadSimulatedSeed({}).staff[0].userId).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('SIM_CLINIC_USER_ID reemplaza el id del miembro de demo', () => {
    expect(loadSimulatedSeed({ SIM_CLINIC_USER_ID: 'mi-empleado' }).staff[0].userId).toBe('mi-empleado');
  });

  it('expone el nombre de la clínica', () => {
    expect(loadSimulatedSeed({}).clinicName).toBe('Clínica Patitas');
  });
});

describe('SimulatedStaffDirectory', () => {
  const seed = loadSimulatedSeed({});
  const directory = new SimulatedStaffDirectory(seed);
  const VET = seed.vetId;
  const MEMBER = seed.staff[0].userId;

  it('devuelve los permisos del miembro de la clínica', async () => {
    await expect(directory.getPermissions(VET, MEMBER)).resolves.toContain('APPOINTMENT_MANAGE');
  });

  it('un usuario que no es del personal → null', async () => {
    await expect(directory.getPermissions(VET, 'no-es-personal')).resolves.toBeNull();
  });

  it('una clínica distinta → null, aunque el usuario sea del personal', async () => {
    await expect(directory.getPermissions('otra-clinica', MEMBER)).resolves.toBeNull();
  });

  it('devuelve una copia de los permisos', async () => {
    const perms = (await directory.getPermissions(VET, MEMBER)) as string[];
    perms.push('INTRUSO');
    expect((await directory.getPermissions(VET, MEMBER)) as string[]).not.toContain('INTRUSO');
  });
});
