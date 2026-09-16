import { CalendarPubSubService } from '../CalendarPubSubService';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';
import { PubSubMessageType } from '@/domain/enums/PubSubMessageType';
import { IEventPublisher } from '@/domain/interfaces/IEventPublisher';

describe('CalendarPubSubService', () => {
  let mockPublisher: jest.Mocked<IEventPublisher>;
  let service: CalendarPubSubService;

  const event = CalendarEvent.create({
    userId: 'user-123',
    petId: 'pet-456',
    title: 'Cita veterinaria',
    description: 'Revisión de Milo',
    eventType: EventType.VET_APPOINTMENT,
    startDate: new Date('2026-07-15T10:00:00Z'),
    endDate: new Date('2026-07-15T11:00:00Z'),
    location: 'Clínica Veterinaria Central',
    reminderAt: new Date('2026-07-14T10:00:00Z'),
    reminderEnabled: true,
  });

  beforeEach(() => {
    mockPublisher = { publish: jest.fn().mockResolvedValue('message-id-123') };
    service = new CalendarPubSubService(mockPublisher);
  });

  it('should publish CALENDAR_PET_CREATED when the event has a pet', async () => {
    const messageId = await service.publishEventCreated(event);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PubSubMessageType.CALENDAR_PET_CREATED,
        userId: event.userId,
      })
    );
    expect(messageId).toBe('message-id-123');
  });

  it('should publish CALENDAR_USER_CREATED when the event has no pet', async () => {
    const userOnlyEvent = CalendarEvent.create({ ...event, petId: null });

    await service.publishEventCreated(userOnlyEvent);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: PubSubMessageType.CALENDAR_USER_CREATED })
    );
  });

  it('should publish a CALENDAR_EVENT_UPDATED message', async () => {
    await service.publishEventUpdated(event);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: PubSubMessageType.CALENDAR_EVENT_UPDATED })
    );
  });

  it('should publish a CALENDAR_EVENT_REMINDER message', async () => {
    await service.publishReminderDue(event);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: PubSubMessageType.CALENDAR_EVENT_REMINDER })
    );
  });

  it('should build the payload matching the notification-microservice contract', async () => {
    await service.publishEventCreated(event);

    const call = mockPublisher.publish.mock.calls[0][0];
    expect(call.payload).toMatchObject({
      eventId: event.id,
      petId: event.petId,
      userId: event.userId,
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location,
      reminderEnabled: event.reminderEnabled,
    });
  });

  it('should omit petId from the payload for user-only events', async () => {
    const userOnlyEvent = CalendarEvent.create({ ...event, petId: null });

    await service.publishEventCreated(userOnlyEvent);

    const call = mockPublisher.publish.mock.calls[0][0];
    expect(call.payload.petId).toBeUndefined();
  });
});
