import { ICalendarEventRepository } from '@/domain/interfaces/ICalendarEventRepository';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { UpdateEventDTO } from '../dtos/CalendarEventDTO';

export class UpdateEventUseCase {
  constructor(private repository: ICalendarEventRepository) {}

  async execute(id: string, userId: string, data: UpdateEventDTO): Promise<CalendarEvent> {
    const event = await this.repository.findById(id);
    
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.userId !== userId) {
      throw new Error('Unauthorized to update this event');
    }

    event.update(data);
    return await this.repository.update(event);
  }
}