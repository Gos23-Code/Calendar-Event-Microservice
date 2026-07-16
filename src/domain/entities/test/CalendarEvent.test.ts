import { CalendarEvent } from '../CalendarEvent';
import { EventType } from '../../enums/EventType';

// Definir el tipo para los props de creación - DEBE COINCIDIR CON CalendarEvent.create
type CreateEventProps = {
  userId: string;
  petId: string;
  title: string;
  description: string | null;  
  eventType: EventType;
  eventDate: Date;
  reminderAt: Date | null;     
  reminderEnabled: boolean;
};

describe('CalendarEvent Entity', () => {
  const mockProps: CreateEventProps = {
    userId: 'user-123',
    petId: 'pet-456',
    title: 'Cita veterinaria',
    description: 'Revisión de Milo',  // 👈 string, no undefined
    eventType: EventType.VET_APPOINTMENT,
    eventDate: new Date('2026-07-15T10:00:00Z'),
    reminderAt: new Date('2026-07-14T10:00:00Z'), // 👈 Date, no undefined
    reminderEnabled: true,
  };

  describe('create', () => {
    it('should create a new event with generated ID', () => {
      const event = CalendarEvent.create(mockProps);

      expect(event).toBeInstanceOf(CalendarEvent);
      expect(event.id).toBeDefined();
      expect(event.userId).toBe(mockProps.userId);
      expect(event.petId).toBe(mockProps.petId);
      expect(event.title).toBe(mockProps.title);
      expect(event.description).toBe(mockProps.description);
      expect(event.eventType).toBe(mockProps.eventType);
      expect(event.eventDate).toBe(mockProps.eventDate);
      expect(event.reminderAt).toBe(mockProps.reminderAt);
      expect(event.reminderEnabled).toBe(mockProps.reminderEnabled);
    });

    it('should set description to null if not provided', () => {
      const event = CalendarEvent.create({
        ...mockProps,
        description: null, // 👈 Explicitamente null
      });
      expect(event.description).toBeNull();
    });

    it('should set reminderAt to null if not provided', () => {
      const event = CalendarEvent.create({
        ...mockProps,
        reminderAt: null, // 👈 Explicitamente null
      });
      expect(event.reminderAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update event properties', () => {
      const event = CalendarEvent.create(mockProps);
      const updateData = {
        title: 'Nuevo título',
        description: 'Nueva descripción',
        eventDate: new Date('2026-07-20T10:00:00Z'),
        reminderEnabled: false,
      };

      event.update(updateData);

      expect(event.title).toBe(updateData.title);
      expect(event.description).toBe(updateData.description);
      expect(event.eventDate).toBe(updateData.eventDate);
      expect(event.reminderEnabled).toBe(updateData.reminderEnabled);
      expect(event.updatedAt).toBeDefined();
    });

    it('should not update undefined fields', () => {
      const event = CalendarEvent.create(mockProps);
      const originalTitle = event.title;
      
      event.update({ description: 'Nueva descripción' });

      expect(event.title).toBe(originalTitle);
      expect(event.description).toBe('Nueva descripción');
    });

    it('should update only provided fields', () => {
      const event = CalendarEvent.create(mockProps);
      const originalEventDate = event.eventDate;
      const originalReminderEnabled = event.reminderEnabled;
      
      event.update({ 
        title: 'Título actualizado',
        description: 'Descripción actualizada'
      });

      expect(event.title).toBe('Título actualizado');
      expect(event.description).toBe('Descripción actualizada');
      expect(event.eventDate).toBe(originalEventDate);
      expect(event.reminderEnabled).toBe(originalReminderEnabled);
      expect(event.updatedAt).toBeDefined();
    });

    it('should handle update with null values', () => {
      const event = CalendarEvent.create(mockProps);
      
      event.update({ 
        description: null,
        reminderAt: null
      });

      expect(event.description).toBeNull();
      expect(event.reminderAt).toBeNull();
    });
  });
});