import { EventType } from '@/domain/enums/EventType';

export interface CreateEventDTO {
  userId: string;
  petId?: string | null;
  title: string;
  description?: string;
  eventType: EventType;
  startDate: Date;
  endDate: Date;
  location?: string;
  reminderAt?: Date;
  reminderEnabled: boolean;
}

export interface UpdateEventDTO {
  title?: string;
  description?: string;
  eventType?: EventType;
  startDate?: Date;
  endDate?: Date;
  location?: string;
  reminderAt?: Date;
  reminderEnabled?: boolean;
}

export interface EventFiltersDTO {
  petId?: string;
  /** true = only events linked to a pet ("calendario B"), false = only user-only events ("calendario A") */
  withPet?: boolean;
  /** Rango de búsqueda sobre startDate — no confundir con el startDate/endDate del propio evento */
  fromDate?: Date;
  toDate?: Date;
  eventType?: EventType;
  searchTerm?: string;
}
