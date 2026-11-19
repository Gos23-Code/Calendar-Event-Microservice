import { AppError } from '@/domain/errors/AppError';
import { ClinicAgendaUseCase } from '@/application/use-cases/AppointmentQueriesUseCase';
import { AppointmentLifecycleUseCase } from '@/application/use-cases/AppointmentLifecycleUseCase';
import { IPetDirectory, PetSummary } from '@/domain/interfaces/IPetDirectory';
import { clinicPrincipal, makeRecord, PET, VET } from '@/application/use-cases/test/fakes';
import { handleAppointmentAction, handleClinicAgenda } from '../appointmentHandlers';

function petsReturning(map: Map<string, PetSummary>): IPetDirectory & { getPets: jest.Mock } {
  return { getPets: jest.fn(async () => map) } as unknown as IPetDirectory & { getPets: jest.Mock };
}

const TOBY: PetSummary = { id: PET, name: 'Toby', ownerId: 'owner-1' };
const authenticate = async () => clinicPrincipal();
const AGENDA_PARAMS = new URLSearchParams('from=2026-12-07T00:00:00Z&to=2026-12-08T00:00:00Z');
const NOW_DATE = new Date('2026-11-19T00:00:00Z');

describe('petName en las respuestas de citas', () => {
  it('la agenda trae el nombre de la mascota de cada cita, en una sola consulta a Pets', async () => {
    const records = [makeRecord({ id: 'a1' }), makeRecord({ id: 'a2' })];
    const agenda = { list: jest.fn(async () => records) } as unknown as ClinicAgendaUseCase;
    const pets = petsReturning(new Map([[PET, TOBY]]));

    const result = await handleClinicAgenda(
      { authorization: 'x', veterinaryId: VET, params: AGENDA_PARAMS, now: NOW_DATE },
      { authenticate, agenda, pets }
    );

    expect(result.status).toBe(200);
    const body = result.body as { appointments: Array<{ id: string; petName: string | null }> };
    expect(body.appointments.map((a) => a.petName)).toEqual(['Toby', 'Toby']);
    expect(pets.getPets).toHaveBeenCalledTimes(1);
  });

  it('una mascota que Pets no conoce deja petName en null', async () => {
    const agenda = { list: jest.fn(async () => [makeRecord()]) } as unknown as ClinicAgendaUseCase;
    const result = await handleClinicAgenda(
      { authorization: 'x', veterinaryId: VET, params: AGENDA_PARAMS, now: NOW_DATE },
      { authenticate, agenda, pets: petsReturning(new Map()) }
    );
    const body = result.body as { appointments: Array<{ petName: string | null }> };
    expect(body.appointments[0].petName).toBeNull();
  });

  it('si Pets no responde, la agenda falla con 503 (no devuelve citas incompletas)', async () => {
    const agenda = { list: jest.fn(async () => [makeRecord()]) } as unknown as ClinicAgendaUseCase;
    const pets = {
      getPets: jest.fn(async () => {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Pets no respondió a tiempo');
      }),
    } as unknown as IPetDirectory;

    const result = await handleClinicAgenda(
      { authorization: 'x', veterinaryId: VET, params: AGENDA_PARAMS, now: NOW_DATE },
      { authenticate, agenda, pets }
    );
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('una acción PATCH devuelve la cita completa con petName', async () => {
    const record = makeRecord({ id: 'a1' });
    const lifecycle = { confirm: jest.fn(async () => record) } as unknown as AppointmentLifecycleUseCase;

    const result = await handleAppointmentAction(
      {
        authorization: 'x',
        veterinaryId: VET,
        appointmentId: 'a1',
        action: 'confirm',
        body: {},
        now: NOW_DATE,
      },
      { authenticate, lifecycle, pets: petsReturning(new Map([[PET, TOBY]])) }
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: 'a1', petId: PET, petName: 'Toby' });
  });
});
