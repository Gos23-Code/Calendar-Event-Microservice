import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';

export interface SupabaseCalendarEventRow {
  id: string;
  user_id: string;
  pet_id: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  start_date: string;
  end_date: string;
  location: string | null;
  reminder_at: string | null;
  reminder_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export function mapSupabaseRowToCalendarEvent(row: SupabaseCalendarEventRow): CalendarEvent {
  return new CalendarEvent(
    row.id,
    row.user_id,
    row.pet_id,
    row.title,
    row.description,
    row.event_type,
    new Date(row.start_date),
    new Date(row.end_date),
    row.location,
    row.reminder_at ? new Date(row.reminder_at) : null,
    row.reminder_enabled,
    row.created_at ? new Date(row.created_at) : undefined,
    row.updated_at ? new Date(row.updated_at) : undefined
  );
}
