import { SimulatedScheduleRulesProvider } from '../SimulatedScheduleRulesProvider';
import {
  SimulatedClinicConfigProvider,
  SimulatedPetAccessProvider,
  SimulatedServiceCatalog,
} from '../simulated/SimulatedVeterinaryDirectory';
import { loadSimulatedSeed } from '../simulated/simulatedSeed';

const seed = loadSimulatedSeed({});
const VET = seed.vetId;
const OWNER = seed.ownerUserId;
const TOBY = seed.pets[0].petId;
const NUBE = seed.pets[2].petId;
const POSOP = seed.services.find((s) => s.name === 'Control posoperatorio')!.serviceId;
const BANO = seed.services.find((s) => s.name === 'Baño y corte')!.serviceId;

describe('loadSimulatedSeed', () => {
  it('sin variables de entorno usa los valores de la semilla', () => {
    expect(loadSimulatedSeed({}).vetId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('SIM_VET_ID y SIM_OWNER_USER_ID sobreescriben la clínica y el dueño de la demo', () => {
    const s = loadSimulatedSeed({
      SIM_VET_ID: 'clinica-real-id',
      SIM_OWNER_USER_ID: 'dueno-real-id',
    });
    expect(s.vetId).toBe('clinica-real-id');
    expect(s.ownerUserId).toBe('dueno-real-id');
    // Las mascotas del dueño de demo pasan a ser del dueño real
    expect(s.pets.filter((p) => p.ownerUserId === 'dueno-real-id')).toHaveLength(2);
    // La mascota sin dueño con app no cambia
    expect(s.pets.find((p) => p.ownerUserId === null)).toBeDefined();
  });

  it('una variable vacía no sobreescribe la semilla', () => {
    expect(loadSimulatedSeed({ SIM_VET_ID: '' }).vetId).toBe(seed.vetId);
  });

  it('la semilla es coherente: todo empleado elegible existe en la agenda simulada', async () => {
    const rules = await new SimulatedScheduleRulesProvider().getScheduleRules({
      veterinaryId: VET,
      from: new Date('2026-12-07T05:00:00.000Z'),
      to: new Date('2026-12-08T05:00:00.000Z'),
    });
    const agenda = new Set(rules.employees.map((e) => e.employeeId));

    for (const service of seed.services) {
      for (const employeeId of service.eligibleEmployeeIds) {
        expect(agenda.has(employeeId)).toBe(true);
      }
    }
  });
});

describe('SimulatedClinicConfigProvider', () => {
  const provider = new SimulatedClinicConfigProvider(seed);

  it('la clínica de demo está activa, con reservas en línea y confirmación requerida', async () => {
    await expect(provider.get(VET)).resolves.toMatchObject({
      status: 'ACTIVE',
      allowOnlineBooking: true,
      bookingRequiresConfirmation: true,
      cancellationMinHours: 24,
      timezone: 'America/Bogota',
    });
  });

  it('una clínica desconocida devuelve null', async () => {
    await expect(provider.get('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
  });
});

describe('SimulatedServiceCatalog', () => {
  const catalog = new SimulatedServiceCatalog(seed);

  it('devuelve nombre, duración, precio, licencia y empleados elegibles', async () => {
    await expect(catalog.get(VET, POSOP)).resolves.toMatchObject({
      name: 'Control posoperatorio',
      durationMinutes: 30,
      price: 45000,
      requiresLicense: false,
      eligibleEmployeeIds: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('Baño y corte dura 60 minutos y solo la peluquera es elegible', async () => {
    const service = await catalog.get(VET, BANO);
    expect(service?.durationMinutes).toBe(60);
    expect(service?.eligibleEmployeeIds).toEqual(['cccccccc-0000-4000-8000-000000000003']);
  });

  it('servicio inexistente o de otra clínica → null', async () => {
    await expect(catalog.get(VET, 'no-existe')).resolves.toBeNull();
    await expect(catalog.get('otra-clinica', POSOP)).resolves.toBeNull();
  });

  it('devuelve una copia: modificar el resultado no altera la semilla', async () => {
    const service = await catalog.get(VET, POSOP);
    service!.eligibleEmployeeIds.push('intruso');
    const again = await catalog.get(VET, POSOP);
    expect(again!.eligibleEmployeeIds).not.toContain('intruso');
  });
});

describe('SimulatedPetAccessProvider', () => {
  const pets = new SimulatedPetAccessProvider(seed);

  it('Toby tiene dueño con app', async () => {
    await expect(pets.getPet(TOBY)).resolves.toEqual({ petId: TOBY, name: 'Toby', ownerUserId: OWNER });
  });

  it('una mascota sin dueño con app devuelve ownerUserId null', async () => {
    await expect(pets.getPet(NUBE)).resolves.toMatchObject({ ownerUserId: null });
  });

  it('mascota inexistente → null', async () => {
    await expect(pets.getPet('no-existe')).resolves.toBeNull();
  });

  it('Toby está compartida con la clínica; Nube no', async () => {
    await expect(pets.isSharedWithClinic(TOBY, VET)).resolves.toBe(true);
    await expect(pets.isSharedWithClinic(NUBE, VET)).resolves.toBe(false);
  });

  it('compartida con una clínica no implica compartida con otra', async () => {
    await expect(pets.isSharedWithClinic(TOBY, 'otra-clinica')).resolves.toBe(false);
  });
});
