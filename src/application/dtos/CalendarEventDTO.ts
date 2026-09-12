import { EventType } from '@/domain/enums/EventType';

export interface CreateEventDTO {
  userId: string;
  petId?: string | null;
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
  /** true = only events linked to a pet ("calendario B"), false = only user-only events ("calendario A") */
  withPet?: boolean;
  startDate?: Date;
  endDate?: Date;
  eventType?: EventType;
  searchTerm?: string;
}