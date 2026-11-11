import { AppError } from '@/domain/errors/AppError';
import { AppointmentOrigin } from '@/domain/enums/AppointmentOrigin';
import { AppointmentStatus } from '@/domain/enums/AppointmentStatus';
import { APP_MIN_LEAD_MINUTES, RequestAppointmentUseCase } from '../RequestAppointmentUseCase';
import {
  clinicPrincipal,
  InMemoryAppointmentRepository,
  LUIS,
  makeDeps,
  makeRecord,
  OWNER,
  ownerPrincipal,
  PET,
  PET_NO_APP,
  PET_OTHER_OWNER,
  CAMILA,
  SARA,
  SERVICE,
  SERVICE_BANO,
  SLOT_10AM,
  VET,
} from './fakes';

const baseInput = {
  veterinaryId: VET,
  serviceId: SERVICE,
  petId: PET,
  startsAt: SLOT_10AM, // lunes 10:00 Bogotá
};

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ status, code });
}

describe('RequestAppointmentUseCase', () => {
  describe('estado según la configuración de la clínica', () => {
    it('con bookingRequiresConfirmation = true nace REQUESTED con origen APP', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ config: { bookingRequiresConfirmation: true } }));

      const record = await useCase.execute(ownerPrincipal(), { ...baseInput, notes: 'Se lame la herida' });

      expect(record.status).toBe(AppointmentStatus.REQUESTED);
      expect(record.origin).toBe(AppointmentOrigin.APP);
      expect(record.ownerUserId).toBe(OWNER);
      expect(record.createdBy).toBe(OWNER);
      expect(record.notes).toBe('Se lame la herida');
    });

    it('con bookingRequiresConfirmation = false nace CONFIRMED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ config: { bookingRequiresConfirmation: false } }));

      const record = await useCase.execute(ownerPrincipal(), baseInput);

      expect(record.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('asigna el veterinario de la franja encontrada (el primero libre)', async () => {
      const record = await new RequestAppointmentUseCase(makeDeps()).execute(ownerPrincipal(), baseInput);
      expect(record.employeeId).toBe(LUIS);
    });

    it('si el primero está ocupado, asigna al siguiente libre a la misma hora', async () => {
      const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
      const record = await new RequestAppointmentUseCase(makeDeps({ repo })).execute(ownerPrincipal(), baseInput);
      expect(record.employeeId).toBe(SARA);
    });

    it('snapshot del servicio y fin calculado', async () => {
      const record = await new RequestAppointmentUseCase(makeDeps()).execute(ownerPrincipal(), baseInput);
      expect(record.serviceName).toBe('Consulta general');
      expect(record.price).toBe(45000);
      expect(record.endsAt.toISOString()).toBe('2026-12-07T15:30:00.000Z');
    });
  });

  describe('clínica', () => {
    it('clínica inactiva → 403 CLINIC_NOT_ACTIVE', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ config: { status: 'INACTIVE' } }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 403, 'CLINIC_NOT_ACTIVE');
    });

    it('clínica con allowOnlineBooking = false → 403 ONLINE_BOOKING_DISABLED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ config: { allowOnlineBooking: false } }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 403, 'ONLINE_BOOKING_DISABLED');
    });

    it('clínica inexistente → 404', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ config: null }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 404, 'NOT_FOUND');
    });

    it('servicio inexistente → 404 SERVICE_NOT_FOUND', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(ownerPrincipal(), { ...baseInput, serviceId: 'svc-inexistente' }),
        404,
        'SERVICE_NOT_FOUND'
      );
    });
  });

  describe('mascota', () => {
    it('mascota ajena → 403 PET_NOT_OWNED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(ownerPrincipal(), { ...baseInput, petId: PET_OTHER_OWNER }),
        403,
        'PET_NOT_OWNED'
      );
    });

    it('mascota sin dueño con app → 403 PET_NOT_OWNED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(ownerPrincipal(), { ...baseInput, petId: PET_NO_APP }),
        403,
        'PET_NOT_OWNED'
      );
    });

    it('mascota inexistente → 403 PET_NOT_OWNED (misma respuesta que ajena, no revela existencia)', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps());
      await expectAppError(
        useCase.execute(ownerPrincipal(), { ...baseInput, petId: 'no-existe' }),
        403,
        'PET_NOT_OWNED'
      );
    });

    it('mascota propia pero no compartida con la clínica → 403 PET_NOT_SHARED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps({ petShared: false }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 403, 'PET_NOT_SHARED');
    });

    it('no consulta si está compartida cuando la mascota no es del dueño', async () => {
      const deps = makeDeps();
      await expect(
        new RequestAppointmentUseCase(deps).execute(ownerPrincipal(), { ...baseInput, petId: PET_OTHER_OWNER })
      ).rejects.toThrow();
      expect(deps.pets.isSharedWithClinic).not.toHaveBeenCalled();
    });
  });

  describe('elegibilidad', () => {
    it('la peluquera solo se asigna a servicios que Veterinary le declara elegibles', async () => {
      // Baño y corte: solo Camila es elegible. Luis y Sara están libres a las 10:00, pero no se les asigna.
      const record = await new RequestAppointmentUseCase(makeDeps()).execute(ownerPrincipal(), {
        ...baseInput,
        serviceId: SERVICE_BANO,
      });
      expect(record.employeeId).toBe(CAMILA);
    });

    it('Camila nunca se asigna a una consulta aunque esté libre', async () => {
      // Luis y Sara ocupados a las 10:00; Camila está libre pero no es elegible para la consulta.
      const repo = new InMemoryAppointmentRepository([
        makeRecord({ id: 'a', employeeId: LUIS }),
        makeRecord({ id: 'b', employeeId: SARA }),
      ]);
      const useCase = new RequestAppointmentUseCase(makeDeps({ repo }));

      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });
  });

  describe('token', () => {
    it('token de clínica (ctx=VETERINARY) → 403 OWNER_TOKEN_REQUIRED', async () => {
      const useCase = new RequestAppointmentUseCase(makeDeps());
      await expectAppError(useCase.execute(clinicPrincipal(), baseInput), 403, 'OWNER_TOKEN_REQUIRED');
    });
  });

  describe('franja', () => {
    it('menos de 1 h de anticipación → 409 SLOT_UNAVAILABLE', async () => {
      // now = 09:30 Bogotá; la cita de 10:00 queda a 30 min
      const useCase = new RequestAppointmentUseCase(
        makeDeps({ now: new Date('2026-12-07T14:30:00.000Z') })
      );
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });

    it('exactamente 1 h de anticipación sí se permite', async () => {
      // now = 09:00 Bogotá; la cita de 10:00 queda a 60 min
      const useCase = new RequestAppointmentUseCase(
        makeDeps({ now: new Date('2026-12-07T14:00:00.000Z') })
      );
      await expect(useCase.execute(ownerPrincipal(), baseInput)).resolves.toBeDefined();
      expect(APP_MIN_LEAD_MINUTES).toBe(60);
    });

    it('franja en el pasado → 409', async () => {
      const useCase = new RequestAppointmentUseCase(
        makeDeps({ now: new Date('2026-12-08T00:00:00.000Z') })
      );
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });

    it('franja ocupada por todos los veterinarios → 409', async () => {
      // Camila (peluquería) también trabaja a las 10:00, así que hay que ocuparla
      const repo = new InMemoryAppointmentRepository([
        makeRecord({ id: 'a', employeeId: LUIS }),
        makeRecord({ id: 'b', employeeId: SARA }),
        makeRecord({ id: 'c', employeeId: CAMILA }),
      ]);
      const useCase = new RequestAppointmentUseCase(makeDeps({ repo, config: { bookingRequiresConfirmation: true } }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });

    it('doble reserva concurrente: la base la rechaza aunque la lectura previa no la vio → 409', async () => {
      const repo = new InMemoryAppointmentRepository([makeRecord({ employeeId: LUIS })]);
      repo.findActive = async () => [];
      // Sin lectura previa, el primer candidato es LUIS, que ya está ocupado en la base.
      const useCase = new RequestAppointmentUseCase(makeDeps({ repo }));
      await expectAppError(useCase.execute(ownerPrincipal(), baseInput), 409, 'SLOT_UNAVAILABLE');
    });
  });
});
