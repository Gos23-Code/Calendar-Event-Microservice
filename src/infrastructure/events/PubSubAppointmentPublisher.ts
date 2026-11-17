import { AppointmentEventMessage } from '@/domain/entities/AppointmentEvent';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';

// Topic de eventos de citas (CONTRATOS_COMPARTIDOS.md, 4.2). Configurable con VET_APPOINTMENTS_TOPIC.
export const DEFAULT_APPOINTMENTS_TOPIC = 'veterinary-appointments';

export interface TopicLike {
  publishMessage(message: { data: Buffer; attributes: Record<string, string> }): Promise<string>;
}

export interface PubSubLike {
  topic(name: string): TopicLike;
}

export function appointmentsTopicName(env: Record<string, string | undefined> = process.env): string {
  const value = env.VET_APPOINTMENTS_TOPIC;
  return value && value.trim() !== '' ? value.trim() : DEFAULT_APPOINTMENTS_TOPIC;
}

// Publica el sobre común como JSON, con el eventType también en los atributos del mensaje.
export class PubSubAppointmentPublisher implements IAppointmentEventPublisher {
  constructor(
    private readonly client: PubSubLike,
    private readonly topicName: string
  ) {}

  async publish(message: AppointmentEventMessage): Promise<void> {
    await this.client.topic(this.topicName).publishMessage({
      data: Buffer.from(JSON.stringify(message)),
      attributes: { eventType: message.eventType },
    });
  }
}
