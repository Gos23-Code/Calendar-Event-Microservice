import { CalendarEventPublisher } from '../CalendarEventPublisher';
import { pubSubClient } from '../client';
import { PubSubMessageType } from '@/domain/enums/PubSubMessageType';
import { CalendarEventMessage } from '@/domain/interfaces/IEventPublisher';

jest.mock('../client', () => ({
  pubSubClient: {
    topic: jest.fn(),
  },
}));

describe('CalendarEventPublisher', () => {
  let publisher: CalendarEventPublisher;
  let publishMessage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    publishMessage = jest.fn().mockResolvedValue('message-id-123');
    (pubSubClient.topic as jest.Mock).mockReturnValue({ publishMessage });
    publisher = new CalendarEventPublisher();
  });

  const message: CalendarEventMessage = {
    eventType: PubSubMessageType.CALENDAR_PET_CREATED,
    userId: 'user-123',
    payload: { title: 'Cita veterinaria' },
    occurredAt: '2026-07-14T10:00:00.000Z',
  };

  it('should publish a message to the calendar topic', async () => {
    const messageId = await publisher.publish(message);

    expect(pubSubClient.topic).toHaveBeenCalledWith('calendar');
    expect(publishMessage).toHaveBeenCalledTimes(1);
    expect(messageId).toBe('message-id-123');
  });

  it('should serialize the message as JSON in the data buffer', async () => {
    await publisher.publish(message);

    const callArgs = publishMessage.mock.calls[0][0];
    expect(JSON.parse(callArgs.data.toString())).toEqual(message);
  });

  it('should set the message eventType as an attribute', async () => {
    await publisher.publish(message);

    const callArgs = publishMessage.mock.calls[0][0];
    expect(callArgs.attributes).toEqual({ eventType: PubSubMessageType.CALENDAR_PET_CREATED });
  });

  it('should propagate errors from the underlying client', async () => {
    publishMessage.mockRejectedValue(new Error('Pub/Sub unavailable'));

    await expect(publisher.publish(message)).rejects.toThrow('Pub/Sub unavailable');
  });
});
