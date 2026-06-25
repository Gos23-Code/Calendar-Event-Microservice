import { ICalendarEventRepository } from '@/domain/interfaces/ICalendarEventRepository';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';
import { EventFiltersDTO } from '@/application/dtos/CalendarEventDTO';
import { supabase } from './client';

// Definir el tipo para la respuesta de Supabase
interface SupabaseEventResponse {
  id: string;
  user_id: string;
  pet_id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  event_date: string;
  reminder_at: string | null;
  reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class CalendarEventRepository implements ICalendarEventRepository {
  async create(event: CalendarEvent): Promise<CalendarEvent> {
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        id: event.id,
        user_id: event.userId,
        pet_id: event.petId,
        title: event.title,
        description: event.description,
        event_type: event.eventType,
        event_date: event.eventDate.toISOString(),
        reminder_at: event.reminderAt?.toISOString() || null,
        reminder_enabled: event.reminderEnabled
      })
      .select()
      .single();

    if (error) throw new Error(`Error creating event: ${error.message}`);
    
    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<CalendarEvent | null> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Error finding event: ${error.message}`);
    }

    return data ? this.mapToEntity(data) : null;
  }

  async findByUserId(userId: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .order('event_date', { ascending: true });

    if (error) throw new Error(`Error finding events: ${error.message}`);
    
    return data.map(this.mapToEntity);
  }

  async findByPetId(petId: string): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('pet_id', petId)
      .order('event_date', { ascending: true });

    if (error) throw new Error(`Error finding events: ${error.message}`);
    
    return data.map(this.mapToEntity);
  }

  async findByUserAndFilters(userId: string, filters?: EventFiltersDTO): Promise<CalendarEvent[]> {
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId);

    if (filters?.petId) {
      query = query.eq('pet_id', filters.petId);
    }
    
    if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }
    
    if (filters?.startDate) {
      query = query.gte('event_date', filters.startDate.toISOString());
    }
    
    if (filters?.endDate) {
      query = query.lte('event_date', filters.endDate.toISOString());
    }

    if (filters?.searchTerm) {
      query = query.or(`title.ilike.%${filters.searchTerm}%,description.ilike.%${filters.searchTerm}%`);
    }

    query = query.order('event_date', { ascending: true });

    const { data, error } = await query;
    
    if (error) throw new Error(`Error finding events: ${error.message}`);
    
    return data.map(this.mapToEntity);
  }

  async update(event: CalendarEvent): Promise<CalendarEvent> {
    const { data, error } = await supabase
      .from('calendar_events')
      .update({
        title: event.title,
        description: event.description,
        event_type: event.eventType,
        event_date: event.eventDate.toISOString(),
        reminder_at: event.reminderAt?.toISOString() || null,
        reminder_enabled: event.reminderEnabled
      })
      .eq('id', event.id)
      .select()
      .single();

    if (error) throw new Error(`Error updating event: ${error.message}`);
    
    return this.mapToEntity(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Error deleting event: ${error.message}`);
  }

  // Ahora tipado correctamente
  private mapToEntity(data: SupabaseEventResponse): CalendarEvent {
    return new CalendarEvent(
      data.id,
      data.user_id,
      data.pet_id,
      data.title,
      data.description,
      data.event_type,
      new Date(data.event_date),
      data.reminder_at ? new Date(data.reminder_at) : null,
      data.reminder_enabled,
      data.created_at ? new Date(data.created_at) : undefined,
      data.updated_at ? new Date(data.updated_at) : undefined
    );
  }
}