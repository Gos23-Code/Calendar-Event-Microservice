import { AppointmentEventMessage } from '@/domain/entities/AppointmentEvent';
import { AppointmentEventType } from '@/domain/enums/AppointmentEventType';
import {
  appointmentsTopicName,
  DEFAULT_APPOINTMENTS_TOPIC,
  PubSubAppointmentPublisher,
} from '../PubSubAppointmentPublisher';

const MESSAGE: AppointmentEventMessage = {
  eventType: AppointmentEventType.CONFIRMED,
  userId: 'owner-1',
  recipient: null,
  payload: {
    appointmentId: 'apt-1',
    veterinaryId: 'vet-1',
    veterinaryName: 'Clínica Patitas',
    address: null,
    phone: null,
    petName: 'Toby',
    serviceName: 'Consulta general',
    status: 'CONFIRMED',
    startsAt: '2026-12-07T15:00:00.000Z',
    endsAt: '2026-12-07T15:30:00.000Z',
    timezone: 'America/Bogota',
    cancellationReason: null,
  },
  occurredAt: '2026-12-01T00:00:00.000Z',
  metadata: { version: '1.0', source: 'calendar-service', veterinaryId: 'vet-1', correlationId: 'c-1' },
};

describe('appointmentsTopicName', () => {
  it('por defecto es veterinary-appointments', () => {
    expect(appointmentsTopicName({})).toBe(DEFAULT_APPOINTMENTS_TOPIC);
    expect(DEFAULT_APPOINTMENTS_TOPIC).toBe('veterinary-appointments');
  });

  it('VET_APPOINTMENTS_TOPIC la sobreescribe', () => {
    expect(appointmentsTopicName({ VET_APPOINTMENTS_TOPIC: 'mi-topic' })).toBe('mi-topic');
  });

  it('un valor vacío o solo espacios usa el valor por defecto', () => {
    expect(appointmentsTopicName({ VET_APPOINTMENTS_TOPIC: '   ' })).toBe(DEFAULT_APPOINTMENTS_TOPIC);
  });
});

describe('PubSubAppointmentPublisher', () => {
  it('publica en el topic indicado, con el sobre como JSON y eventType en los atributos', async () => {
    const publishMessage = jest.fn(async () => 'msg-id');
    const topic = jest.fn(() => ({ publishMessage }));
    const publisher = new PubSubAppointmentPublisher({ topic }, 'veterinary-appointments');

    await publisher.publish(MESSAGE);

    expect(topic).toHaveBeenCalledWith('veterinary-appointments');
    const sent = publishMessage.mock.calls[0][0] as { data: Buffer; attributes: Record<string, string> };
    expect(JSON.parse(sent.data.toString())).toEqual(MESSAGE);
    expect(sent.attributes).toEqual({ eventType: 'APPOINTMENT_CONFIRMED' });
  });

  it('propaga el error si Pub/Sub falla (lo maneja quien llama)', async () => {
    const publisher = new PubSubAppointmentPublisher(
      { topic: () => ({ publishMessage: async () => Promise.reject(new Error('down')) }) },
      'veterinary-appointments'
    );
    await expect(publisher.publish(MESSAGE)).rejects.toThrow('down');
  });
});
