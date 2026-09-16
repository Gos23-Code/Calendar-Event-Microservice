import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { IEventPublisher } from '@/domain/interfaces/IEventPublisher';
import { PubSubMessageType } from '@/domain/enums/PubSubMessageType';
import { CalendarEventPublisher } from '@/infrastructure/pubsub/CalendarEventPublisher';

export class CalendarPubSubService {
  constructor(private publisher: IEventPublisher = new CalendarEventPublisher()) {}

  async publishEventCreated(event: CalendarEvent): Promise<string> {
    return this.publisher.publish({
      eventType: event.petId ? PubSubMessageType.CALENDAR_PET_CREATED : PubSubMessageType.CALENDAR_USER_CREATED,
      userId: event.userId,
      payload: this.toPayload(event),
      occurredAt: new Date().toISOString(),
    });
  }

  async publishEventUpdated(event: CalendarEvent): Promise<string> {
    return this.publisher.publish({
      eventType: PubSubMessageType.CALENDAR_EVENT_UPDATED,
      userId: event.userId,
      payload: this.toPayload(event),
      occurredAt: new Date().toISOString(),
    });
  }

  async publishReminderDue(event: CalendarEvent): Promise<string> {
    return this.publisher.publish({
      eventType: PubSubMessageType.CALENDAR_EVENT_REMINDER,
      userId: event.userId,
      payload: this.toPayload(event),
      occurredAt: new Date().toISOString(),
    });
  }

  // Forma exacta de CalendarEventPayload esperada por el notification-microservice
  private toPayload(event: CalendarEvent): Record<string, unknown> {
    return {
      eventId: event.id,
      petId: event.petId ?? undefined,
      userId: event.userId,
      title: event.title,
      description: event.description ?? undefined,
      eventType: event.eventType,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location ?? undefined,
      reminderAt: event.reminderAt ? event.reminderAt.toISOString() : undefined,
      reminderEnabled: event.reminderEnabled,
    };
  }
}
