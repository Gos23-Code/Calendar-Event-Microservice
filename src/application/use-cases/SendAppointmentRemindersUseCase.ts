import { AppointmentEventType } from '@/domain/enums/AppointmentEventType';
import { IAppointmentRepository } from '@/domain/interfaces/IAppointmentRepository';
import { AppointmentNotifier } from '@/application/services/AppointmentNotifier';

// Recordatorios de citas (CAL-06): citas CONFIRMED que empiezan en 23–24 h.
// Pensado para correr cada hora. Como cada cita cae en una sola ventana de 1 h,
// y además se marca reminder_sent_at, un recordatorio no se repite aunque el job corra dos veces.
export const REMINDER_WINDOW_START_HOURS = 23;
export const REMINDER_WINDOW_END_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export interface ReminderJobResult {
  enabled: boolean;
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface RemindersDeps {
  appointments: IAppointmentRepository;
  notifier: AppointmentNotifier;
  now: () => Date;
}

export class SendAppointmentRemindersUseCase {
  constructor(private readonly deps: RemindersDeps) {}

  async run(): Promise<ReminderJobResult> {
    if (!this.deps.notifier.enabled) {
      return { enabled: false, checked: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const now = this.deps.now();
    const from = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * HOUR_MS);
    const to = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * HOUR_MS);

    const due = await this.deps.appointments.findDueReminders(from, to);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const appointment of due) {
      const outcome = await this.deps.notifier.notify(AppointmentEventType.REMINDER, appointment);
      if (outcome === 'SENT') {
        // Solo se marca si el evento salió: si falló, no se pierde el recordatorio sin dejar rastro.
        await this.deps.appointments.markReminderSent(appointment.id, now);
        sent++;
      } else if (outcome === 'SKIPPED') {
        skipped++;
      } else {
        failed++;
      }
    }

    return { enabled: true, checked: due.length, sent, skipped, failed };
  }
}
