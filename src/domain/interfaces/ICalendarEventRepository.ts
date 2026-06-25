import { CalendarEvent } from '../entities/CalendarEvent';
import { EventFiltersDTO } from '@/application/dtos/CalendarEventDTO';

export interface ICalendarEventRepository {
  create(event: CalendarEvent): Promise<CalendarEvent>;
  findById(id: string): Promise<CalendarEvent | null>;
  findByUserId(userId: string): Promise<CalendarEvent[]>;
  findByPetId(petId: string): Promise<CalendarEvent[]>;
  findByUserAndFilters(userId: string, filters?: EventFiltersDTO): Promise<CalendarEvent[]>;
  update(event: CalendarEvent): Promise<CalendarEvent>;
  delete(id: string): Promise<void>;
}