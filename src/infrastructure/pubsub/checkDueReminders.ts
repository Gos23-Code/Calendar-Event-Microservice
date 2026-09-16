import { supabase } from '@/infrastructure/database/supabase/client';
import { mapSupabaseRowToCalendarEvent, SupabaseCalendarEventRow } from '@/infrastructure/database/supabase/mappers';
import { CalendarPubSubService } from '@/application/services/CalendarPubSubService';
import { MAX_REMINDER_ATTEMPTS } from './constants';

interface DueReminderRow extends SupabaseCalendarEventRow {
  reminder_attempts?: number;
}

export interface CheckDueRemindersResult {
  checked: number;
  notified: string[];
  failed: { id: string; error: string; attempts: number; giveUp: boolean }[];
}

export async function checkDueReminders(
  now: Date = new Date(),
  pubSubService: Pick<CalendarPubSubService, 'publishReminderDue'> = new CalendarPubSubService()
): Promise<CheckDueRemindersResult> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('reminder_enabled', true)
    .eq('reminder_sent', false)
    .lt('reminder_attempts', MAX_REMINDER_ATTEMPTS)
    .lte('reminder_at', now.toISOString());

  if (error) {
    throw new Error(`Error fetching due reminders: ${error.message}`);
  }

  const dueRows = (data ?? []) as DueReminderRow[];
  const notified: string[] = [];
  const failed: CheckDueRemindersResult['failed'] = [];

  for (const row of dueRows) {
    try {
      await pubSubService.publishReminderDue(mapSupabaseRowToCalendarEvent(row));

      const { error: updateError } = await supabase
        .from('calendar_events')
        .update({ reminder_sent: true })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      notified.push(row.id);
    } catch (err) {
      const attempts = (row.reminder_attempts ?? 0) + 1;
      const giveUp = attempts >= MAX_REMINDER_ATTEMPTS;

      await supabase
        .from('calendar_events')
        .update({ reminder_attempts: attempts })
        .eq('id', row.id);

      failed.push({
        id: row.id,
        error: err instanceof Error ? err.message : 'Unknown error',
        attempts,
        giveUp,
      });
    }
  }

  return { checked: dueRows.length, notified, failed };
}
