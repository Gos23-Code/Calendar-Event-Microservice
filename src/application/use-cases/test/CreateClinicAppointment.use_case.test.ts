import { AppError } from '@/domain/errors/AppError';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { CreateClinicAppointmentUseCase } from '../CreateClinicAppointmentUseCase';
import {
  CLINIC_USER,
  clinicPrincipal,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  OTHER_VET,
  ownerPrincipal,
  PET,
  PET_NO_APP,
  PET_OTHER_OWNER,
  CAMILA,
  SARA,
  SERVICE,
  SERVICE_LICENSED,
  SLOT_10AM,
  VET,
} from './fakes';

const baseInput = {
  veterinaryId: VET,
  serviceId: SERVICE,
  petId: PET,
  employeeId: LUIS,
  startsAt: SLOT_10AM, // lunes 10:00 Bogotá
};

// Espera un AppError con status y código concretos
async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ status, code });
}

describe('CreateClinicAppointmentUseCase', () => {
  describe('creación correcta', () => {
    it('crea la cita CONFIRMED con origen CLINIC, snapshot del servicio y fin calculado', async () => {
      const deps = makeDeps();
      const useCase = new CreateClinicAppointmentUseCase(deps);

      const record = await useCase.execute(clinicPrincipal(), { ...baseInput, notes: 'Vacuna anual' });

      expect(record.status).toBe(AppointmentStatus.CONFIRMED);
      expect(record.origin).toBe(AppointmentOrigin.CLINIC);
      expect(record.employeeId).toBe(LUIS);
      expect(record.serviceName).toBe('Consulta general');
      expect(record.durationMinutes).toBe(30);
      expect(record.price).toBe(45000);
      expect(record.endsAt.toISOString()).toBe('2026-12-07T15:30:00.000Z');
      expect(record.notes).toBe('Vacuna anual');
      expect(record.createdBy).toBe(CLINIC_USER);
      expect(deps.appointments.rows).toHaveLength(1);
    });

    it('toma el ownerUserId de la mascota', async () => {
      const deps = makeDeps();
      const record = await new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), baseInput);
      expect(record.ownerUserId).toBe('owner-1');
    });

    it('una mascota sin dueño con app guarda ownerUserId null', async () => {
      const deps = makeDeps();
      const record = await new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), {
        ...baseInput,
        petId: PET_NO_APP,
      });
      expect(record.ownerUserId).toBeNull();
    });

    it('otro veterinario libre a la misma hora sí puede recibir la cita', async () => {
      const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
      const deps = makeDeps({ repo });

      const record = await new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), {
        ...baseInput,
        employeeId: SARA,
      });

      expect(record.employeeId).toBe(SARA);
    });
  });

  describe('tenant y permisos', () => {
    it('token de otra clínica (vet_id distinto de la ruta) → 403 TENANT_MISMATCH, sin consultar nada', async () => {
      const deps = makeDeps();
      const useCase = new CreateClinicAppointmentUseCase(deps);

      await expectAppError(useCase.execute(clinicPrincipal(OTHER_VET), baseInput), 403, 'TENANT_MISMATCH');
      expect(deps.access.getAccess).not.toHaveBeenCalled();
      expect(deps.appointments.rows).toHaveLength(0);
    });

    it('token de dueño (ctx=USER) → 403 CLINIC_TOKEN_REQUIRED', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 403, 'CLINIC_TOKEN_REQUIRED');
    });

    it('clínica o mascota inexistente en Veterinary (access = null) → 404', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ access: null }));
      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 404, 'NOT_FOUND');
    });

    it('sin acceso a la mascota (no empleado activo o no compartida) → 403 ACCESS_DENIED', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ access: { hasAccess: false, permissions: [] } }));
      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 403, 'ACCESS_DENIED');
    });

    it('con acceso pero sin APPOINTMENT_MANAGE → 403 PERMISSION_DENIED', async () => {
      const useCase = new CreateClinicAppointmentUseCase(
        makeDeps({ access: { permissions: ['CLINICAL_READ'] } })
      );
      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 403, 'PERMISSION_DENIED');
    });

    it('clínica inexistente → 404', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ config: null }));
      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 404, 'NOT_FOUND');
    });
  });

  describe('referencias', () => {
    it('empleado de otra clínica (no existe en esta) → 404 EMPLOYEE_NOT_FOUND', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, employeeId: 'empleado-de-otra-clinica' }),
        404,
        'EMPLOYEE_NOT_FOUND'
      );
    });

    it('servicio que no existe en la clínica → 404 SERVICE_NOT_FOUND', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, serviceId: 'svc-inexistente' }),
        404,
        'SERVICE_NOT_FOUND'
      );
    });

    it('mascota que la semilla no conoce: la valida Veterinary; la cita se crea sin dueño conocido', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      const result = await useCase.execute(clinicPrincipal(), { ...baseInput, petId: 'mascota-inexistente' });
      expect(result.petId).toBe('mascota-inexistente');
      expect(result.ownerUserId).toBeNull();
    });
  });

  describe('franja', () => {
    it('franja ocupada por otra cita del mismo empleado → 409 SLOT_UNAVAILABLE', async () => {
      const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ repo }));

      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
      expect(repo.rows).toHaveLength(1);
    });

    it('franja en el almuerzo (12:00 Bogotá) → 409', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, startsAt: new Date('2026-12-07T17:00:00.000Z') }),
        409,
        'SLOT_UNAVAILABLE'
      );
    });

    it('franja fuera del horario (07:00 Bogotá) → 409', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, startsAt: new Date('2026-12-07T12:00:00.000Z') }),
        409,
        'SLOT_UNAVAILABLE'
      );
    });

    it('hora que no cae en la rejilla de 30 min (10:10 Bogotá) → 409', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, startsAt: new Date('2026-12-07T15:10:00.000Z') }),
        409,
        'SLOT_UNAVAILABLE'
      );
    });

    it('la clínica puede agendar en el mismo día aunque falten minutos (sin margen de 1 h)', async () => {
      // now = 09:50 Bogotá; la cita de 10:00 sigue siendo válida para la clínica
      const deps = makeDeps({ now: new Date('2026-12-07T14:50:00.000Z') });
      await expect(new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), baseInput)).resolves.toBeDefined();
    });

    it('doble reserva concurrente: la base la rechaza aunque la lectura previa no la vio → 409', async () => {
      // La consulta de citas activas devuelve vacío (lectura desactualizada), pero la base ya tiene la cita.
      const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
      repo.findActive = async () => [];
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ repo }));

      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });
  });

  it('no consulta la mascota ni el servicio si el permiso falla', async () => {
    const deps = makeDeps({ access: { permissions: [] } });
    await expect(new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), baseInput)).rejects.toThrow();
    expect(deps.pets.getPet).not.toHaveBeenCalled();
    expect(deps.catalog.get).not.toHaveBeenCalled();
  });

  describe('elegibilidad y licencia (catálogo de Veterinary)', () => {
    it('un empleado que Veterinary no declara elegible para el servicio → 409 EMPLOYEE_NOT_ELIGIBLE', async () => {
      // Camila (peluquería) existe en la clínica, pero no puede dar una consulta general
      const useCase = new CreateClinicAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, employeeId: CAMILA }),
        409,
        'EMPLOYEE_NOT_ELIGIBLE'
      );
    });

    it('servicio que exige licencia con profesional sin licencia verificada → 403 LICENSE_REQUIRED', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ access: { licensed: false } }));
      await expectAppError(
        useCase.execute(clinicPrincipal(), { ...baseInput, serviceId: SERVICE_LICENSED }),
        403,
        'LICENSE_REQUIRED'
      );
    });

    it('servicio que exige licencia con profesional licenciado → se crea', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ access: { licensed: true } }));
      await expect(
        useCase.execute(clinicPrincipal(), { ...baseInput, serviceId: SERVICE_LICENSED })
      ).resolves.toBeDefined();
    });

    it('un servicio sin licencia requerida se crea aunque el profesional no tenga licencia', async () => {
      const useCase = new CreateClinicAppointmentUseCase(makeDeps({ access: { licensed: false } }));
      await expect(useCase.execute(clinicPrincipal(), baseInput)).resolves.toBeDefined();
    });
  });

  it('no usa la mascota de otro dueño como cita de otro (la mascota solo aporta el ownerUserId)', async () => {
    const deps = makeDeps();
    const record = await new CreateClinicAppointmentUseCase(deps).execute(clinicPrincipal(), {
      ...baseInput,
      petId: PET_OTHER_OWNER,
    });
    expect(record.ownerUserId).toBe('owner-2');
  });
});
