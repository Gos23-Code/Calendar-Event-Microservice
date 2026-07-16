import { CalendarEventRepository } from '../CalendarEventRepository';
import { supabase } from '../client';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';

// Mock de supabase con encadenamiento correcto
jest.mock('../client', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
  },
}));

describe('CalendarEventRepository', () => {
  let repository: CalendarEventRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new CalendarEventRepository();
  });

  const mockEvent = CalendarEvent.create({
    userId: 'user-123',
    petId: 'pet-456',
    title: 'Cita veterinaria',
    description: 'Revisión de Milo',
    eventType: EventType.VET_APPOINTMENT,
    eventDate: new Date('2026-07-15T10:00:00Z'),
    reminderAt: new Date('2026-07-14T10:00:00Z'),
    reminderEnabled: true,
  });

  const mockSupabaseResponse = {
    id: mockEvent.id,
    user_id: mockEvent.userId,
    pet_id: mockEvent.petId,
    title: mockEvent.title,
    description: mockEvent.description,
    event_type: mockEvent.eventType,
    event_date: mockEvent.eventDate.toISOString(),
    reminder_at: mockEvent.reminderAt?.toISOString() || null,
    reminder_enabled: mockEvent.reminderEnabled,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe('create', () => {
    it('should create an event successfully', async () => {
      // Mock correcto para la cadena de métodos
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSupabaseResponse,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await repository.create(mockEvent);

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result.id).toBe(mockEvent.id);
    });

    it('should throw error if creation fails', async () => {
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      await expect(repository.create(mockEvent)).rejects.toThrow('Error creating event');
    });
  });

  describe('findById', () => {
    it('should find an event by id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSupabaseResponse,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await repository.findById(mockEvent.id);

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result?.id).toBe(mockEvent.id);
    });

    it('should return null if event not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find events by user id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [mockSupabaseResponse],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const results = await repository.findByUserId('user-123');

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(CalendarEvent);
    });
  });

  describe('findByPetId', () => {
    it('should find events by pet id', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [mockSupabaseResponse],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const results = await repository.findByPetId('pet-456');

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(CalendarEvent);
    });
  });

  describe('update', () => {
    it('should update an event successfully', async () => {
      const mockQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockSupabaseResponse,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const result = await repository.update(mockEvent);

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result.id).toBe(mockEvent.id);
    });
  });

  describe('delete', () => {
    it('should delete an event successfully', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      await repository.delete(mockEvent.id);

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', mockEvent.id);
    });

    it('should throw error if delete fails', async () => {
      const mockQuery = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Delete error' },
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      await expect(repository.delete(mockEvent.id)).rejects.toThrow('Error deleting event');
    });
  });

  describe('findByUserAndFilters', () => {
    it('should find events with filters', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [mockSupabaseResponse],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const filters = {
        petId: 'pet-456',
        eventType: EventType.VET_APPOINTMENT,
      };

      const results = await repository.findByUserAndFilters('user-123', filters);

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(CalendarEvent);
    });

    it('should handle empty filters', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [mockSupabaseResponse],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue(mockQuery);

      const results = await repository.findByUserAndFilters('user-123');

      expect(supabase.from).toHaveBeenCalledWith('calendar_events');
      expect(results).toHaveLength(1);
    });
  });
});