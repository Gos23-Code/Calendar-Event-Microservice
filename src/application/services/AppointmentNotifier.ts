import { AppointmentRecord } from '@/domain/entities/Appointment';
import { Actor, AppointmentEventMessage, EventRecipient } from '@/domain/entities/AppointmentEvent';
import { AppointmentEventType } from '@/domain/enums/AppointmentEventType';
import { IAppointmentEventPublisher } from '@/domain/interfaces/IAppointmentEventPublisher';
import { IClinicConfigProvider } from '@/domain/interfaces/IClinicConfigProvider';
import { IPetAccessProvider } from '@/domain/interfaces/IPetAccessProvider';
import { audienceFor } from '@/domain/services/appointmentEventRouting';

// Resultado de intentar notificar. Nunca lanza: un fallo de publicación no debe tumbar la petición.
export type NotifyOutcome = 'SENT' | 'DISABLED' | 'SKIPPED' | 'FAILED';

export interface NotifierDeps {
  publisher: IAppointmentEventPublisher;
  clinicConfig: IClinicConfigProvider;
  pets: IPetAccessProvider;
  newId: () => string;
  now: () => Date;
  enabled: boolean; // EVENTS_ENABLED
}

// Arma el sobre común y lo publica (CALENDAR_SERVICE_CHANGES.md, CAL-06).
export class AppointmentNotifier {
  constructor(private readonly deps: NotifierDeps) {}

  get enabled(): boolean {
    return this.deps.enabled;
  }

  async notify(eventType: AppointmentEventType, record: AppointmentRecord, by?: Actor): Promise<NotifyOutcome> {
    if (!this.deps.enabled) {
      return 'DISABLED';
    }

    try {
      const config = await this.deps.clinicConfig.get(record.veterinaryId);
      if (!config) {
        return 'SKIPPED';
      }

      let userId: string | null = null;
      let recipient: EventRecipient | null = null;

      if (audienceFor(eventType, by) === 'OWNER') {
        // Dueño sin app: haría falta su contacto desde Pets (dependencia de la Fase 5). Hoy no se notifica.
        if (!record.ownerUserId) {
          return 'SKIPPED';
        }
        userId = record.ownerUserId;
      } else {
        recipient = { name: config.name, phone: config.phone, email: null };
      }

      const pet = await this.deps.pets.getPet(record.petId);

      const message: AppointmentEventMessage = {
        eventType,
        userId,
        recipient,
        payload: {
          appointmentId: record.id,
          veterinaryId: record.veterinaryId,
          veterinaryName: config.name,
          address: config.address,
          phone: config.phone,
          petName: pet ? pet.name : '',
          serviceName: record.serviceName,
          status: record.status,
          startsAt: record.startsAt.toISOString(),
          endsAt: record.endsAt.toISOString(),
          timezone: config.timezone,
          cancellationReason: record.cancellationReason,
        },
        occurredAt: this.deps.now().toISOString(),
        metadata: {
          version: '1.0',
          source: 'calendar-service',
          veterinaryId: record.veterinaryId,
          correlationId: this.deps.newId(),
        },
      };

      await this.deps.publisher.publish(message);
      return 'SENT';
    } catch (error) {
      console.error('❌ No se pudo publicar el evento de cita:', eventType, error);
      return 'FAILED';
    }
  }
}
