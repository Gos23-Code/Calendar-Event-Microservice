import { ICalendarEventRepository } from '@/domain/interfaces/ICalendarEventRepository';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { CreateEventDTO } from '../dtos/CalendarEventDTO';
import { EventType } from '@/domain/enums/EventType';

export class CreateEventUseCase {
  constructor(private repository: ICalendarEventRepository) {}

  async execute(data: CreateEventDTO): Promise<CalendarEvent> {
    this.validateEventData(data);

    const event = CalendarEvent.create({
      userId: data.userId,
      petId: data.petId || null,
      title: data.title,
      description: data.description || null,
      eventType: data.eventType,
      startDate: data.startDate,
      endDate: data.endDate,
      location: data.location || null,
      reminderAt: data.reminderAt || null,
      reminderEnabled: data.reminderEnabled
    });

    return await this.repository.create(event);
  }

  private validateEventData(data: CreateEventDTO): void {
    if (!data.title || data.title.trim().length === 0) {
      throw new Error('Title is required');
    }
    if (data.title.length > 255) {
      throw new Error('Title must be less than 255 characters');
    }
    if (!data.startDate) {
      throw new Error('Start date is required');
    }
    if (data.startDate < new Date()) {
      throw new Error('Start date cannot be in the past');
    }
    if (!data.endDate) {
      throw new Error('End date is required');
    }
    if (data.endDate < data.startDate) {
      throw new Error('End date cannot be before start date');
    }
    if (!Object.values(EventType).includes(data.eventType)) {
      throw new Error('Invalid event type');
    }
  }
}
