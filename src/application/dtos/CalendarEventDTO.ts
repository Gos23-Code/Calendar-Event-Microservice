import { EventType } from '@/domain/enums/EventType';

export interface CreateEventDTO {
  userId: string;
  petId: string;
  title: string;
  description?: string;
  eventType: EventType;
  eventDate: Date;
  reminderAt?: Date;
  reminderEnabled: boolean;
}

export interface UpdateEventDTO {
  title?: string;
  description?: string;
  eventType?: EventType;
  eventDate?: Date;
  reminderAt?: Date;
  reminderEnabled?: boolean;
}

export interface EventFiltersDTO {
  petId?: string;
  startDate?: Date;
  endDate?: Date;
  eventType?: EventType;
  searchTerm?: string;
}