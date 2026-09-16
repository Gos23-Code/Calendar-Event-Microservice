import { IEventPublisher, CalendarEventMessage } from '@/domain/interfaces/IEventPublisher';
import { pubSubClient } from './client';
import { CALENDAR_TOPIC_NAME } from './constants';

export class CalendarEventPublisher implements IEventPublisher {
  async publish(message: CalendarEventMessage): Promise<string> {
    const dataBuffer = Buffer.from(JSON.stringify(message));

    return pubSubClient.topic(CALENDAR_TOPIC_NAME).publishMessage({
      data: dataBuffer,
      attributes: {
        eventType: message.eventType,
      },
    });
  }
}
