import { AppointmentEventMessage } from '@/domain/entities/AppointmentEvent';
import { AppointmentEventType } from '@/domain/enums/AppointmentEventType';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';
import { AppointmentNotifier } from '../AppointmentNotifier';
import { makeDeps, makeRecord, NOW, OWNER, PET_NO_APP, VET } from '@/application/use-cases/test/fakes';

class RecordingPublisher implements IAppointmentEventPublisher {
  messages: AppointmentEventMessage[] = [];
  fail = false;

  async publish(message: AppointmentEventMessage): Promise<void> {
    if (this.fail) {
      throw new Error('Pub/Sub no responde');
    }
    this.messages.push(message);
  }
}

function notifierWith(publisher: IAppointmentEventPublisher, enabled = true) {
  const deps = makeDeps();
  return new AppointmentNotifier({
    publisher,
    clinicConfig: deps.clinicConfig,
    pets: deps.pets,
    newId: () => 'corr-1',
    now: () => NOW,
    enabled,
  });
}

describe('AppointmentNotifier', () => {
  it('con EVENTS_ENABLED apagado no publica nada', async () => {
    const publisher = new RecordingPublisher();
    const outcome = await notifierWith(publisher, false).notify(AppointmentEventType.CONFIRMED, makeRecord());

    expect(outcome).toBe('DISABLED');
    expect(publisher.messages).toHaveLength(0);
  });

  it('evento para el dueño: userId del dueño y sin recipient', async () => {
    const publisher = new RecordingPublisher();
    const outcome = await notifierWith(publisher).notify(AppointmentEventType.CONFIRMED, makeRecord());

    expect(outcome).toBe('SENT');
    expect(publisher.messages[0]).toMatchObject({
      eventType: 'APPOINTMENT_CONFIRMED',
      userId: OWNER,
      recipient: null,
    });
  });

  it('evento para la clínica (REQUESTED): userId null y recipient con el contacto de la clínica', async () => {
    const publisher = new RecordingPublisher();
    await notifierWith(publisher).notify(AppointmentEventType.REQUESTED, makeRecord());

    expect(publisher.messages[0].userId).toBeNull();
    expect(publisher.messages[0].recipient).toEqual({
      name: 'Clínica Patitas',
      phone: '+573000000000',
      email: null,
    });
  });

  it('el payload trae todo lo que la notificación necesita sin llamar a otro servicio', async () => {
    const publisher = new RecordingPublisher();
    await notifierWith(publisher).notify(AppointmentEventType.CONFIRMED, makeRecord());

    expect(publisher.messages[0].payload).toEqual({
      appointmentId: 'existing-1',
      veterinaryId: VET,
      veterinaryName: 'Clínica Patitas',
      address: 'Calle 1 # 2-3, Bogotá',
      phone: '+573000000000',
      petName: 'Toby',
      serviceName: 'Consulta general',
      status: 'CONFIRMED',
      startsAt: '2026-12-07T15:00:00.000Z',
      endsAt: '2026-12-07T15:30:00.000Z',
      timezone: 'America/Bogota',
      cancellationReason: null,
    });
  });

  it('el sobre trae metadata: versión, origen, clínica y correlationId', async () => {
    const publisher = new RecordingPublisher();
    await notifierWith(publisher).notify(AppointmentEventType.CONFIRMED, makeRecord());

    expect(publisher.messages[0].metadata).toEqual({
      version: '1.0',
      source: 'calendar-service',
      veterinaryId: VET,
      correlationId: 'corr-1',
    });
    expect(publisher.messages[0].occurredAt).toBe(NOW.toISOString());
  });

  it('dueño sin app: se omite, sin publicar y sin error', async () => {
    const publisher = new RecordingPublisher();
    const outcome = await notifierWith(publisher).notify(
      AppointmentEventType.CONFIRMED,
      makeRecord({ ownerUserId: null, petId: PET_NO_APP })
    );

    expect(outcome).toBe('SKIPPED');
    expect(publisher.messages).toHaveLength(0);
  });

  it('cancelación del dueño: el evento va a la clínica', async () => {
    const publisher = new RecordingPublisher();
    await notifierWith(publisher).notify(AppointmentEventType.CANCELLED, makeRecord(), 'OWNER');
    expect(publisher.messages[0].userId).toBeNull();
    expect(publisher.messages[0].recipient?.name).toBe('Clínica Patitas');
  });

  it('cancelación de la clínica: el evento va al dueño', async () => {
    const publisher = new RecordingPublisher();
    await notifierWith(publisher).notify(AppointmentEventType.CANCELLED, makeRecord(), 'CLINIC');
    expect(publisher.messages[0].userId).toBe(OWNER);
  });

  it('una falla de Pub/Sub se registra y devuelve FAILED, sin lanzar', async () => {
    const publisher = new RecordingPublisher();
    publisher.fail = true;

    await expect(
      notifierWith(publisher).notify(AppointmentEventType.CONFIRMED, makeRecord())
    ).resolves.toBe('FAILED');
  });

  it('clínica inexistente: se omite', async () => {
    const deps = makeDeps();
    const notifier = new AppointmentNotifier({
      publisher: new RecordingPublisher(),
      clinicConfig: { get: async () => null },
      pets: deps.pets,
      newId: () => 'c',
      now: () => NOW,
      enabled: true,
    });
    await expect(notifier.notify(AppointmentEventType.CONFIRMED, makeRecord())).resolves.toBe('SKIPPED');
  });
});
