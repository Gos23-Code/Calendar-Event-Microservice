import { ICalendarEventRepository } from '@/domain/interfaces/ICalendarEventRepository';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventFiltersDTO } from '../dtos/CalendarEventDTO';

export class ListEventsUseCase {
  constructor(private repository: ICalendarEventRepository) {}

  async execute(userId: string, filters?: EventFiltersDTO): Promise<CalendarEvent[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return await this.repository.findByUserAndFilters(userId, filters);
  }
}