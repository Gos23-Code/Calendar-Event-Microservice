import { PubSubMessageType } from '../enums/PubSubMessageType';

// Forma exacta del `DomainEvent` que espera el notification-microservice:
// eventType a nivel raíz enruta al handler, payload queda abierto por dominio.
export interface CalendarEventMessage {
  eventType: PubSubMessageType;
  userId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface IEventPublisher {
  publish(message: CalendarEventMessage): Promise<string>;
}
