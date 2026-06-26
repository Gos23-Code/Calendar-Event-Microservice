import { ICalendarEventRepository } from '@/domain/interfaces/ICalendarEventRepository';

export class DeleteEventUseCase {
  constructor(private repository: ICalendarEventRepository) {}

  async execute(id: string, userId: string): Promise<void> {
    const event = await this.repository.findById(id);
    
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.userId !== userId) {
      throw new Error('Unauthorized to delete this event');
    }

    await this.repository.delete(id);
  }
}