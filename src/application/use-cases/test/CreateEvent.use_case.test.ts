import { CreateEventUseCase } from '../CreateEventUseCase';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';
import { CreateEventDTO } from '../../dtos/CalendarEventDTO';

// Mock del repositorio
const mockRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByPetId: jest.fn(),
  findByUserAndFilters: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('CreateEventUseCase', () => {
  let useCase: CreateEventUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    useCase = new CreateEventUseCase(mockRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const validData: CreateEventDTO = {
    userId: 'user-123',
    petId: 'pet-456',
    title: 'Cita veterinaria',
    description: 'Revisión de Milo',
    eventType: EventType.VET_APPOINTMENT,
    eventDate: new Date('2026-07-15T10:00:00Z'),
    reminderAt: new Date('2026-07-14T10:00:00Z'),
    reminderEnabled: true,
  };

  describe('execute', () => {
    it('should create an event successfully', async () => {
      const expectedEvent = CalendarEvent.create({
        userId: validData.userId,
        petId: validData.petId || null,
        title: validData.title,
        description: validData.description || null,
        eventType: validData.eventType,
        eventDate: validData.eventDate,
        reminderAt: validData.reminderAt || null,
        reminderEnabled: validData.reminderEnabled,
      });
      mockRepository.create.mockResolvedValue(expectedEvent);

      const result = await useCase.execute(validData);

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result.userId).toBe(validData.userId);
      expect(result.title).toBe(validData.title);
    });

    it('should throw error if title is empty', async () => {
      const invalidData: CreateEventDTO = { 
        ...validData, 
        title: '' 
      };

      await expect(useCase.execute(invalidData)).rejects.toThrow('Title is required');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if title exceeds 255 characters', async () => {
      const invalidData: CreateEventDTO = { 
        ...validData, 
        title: 'a'.repeat(256) 
      };

      await expect(useCase.execute(invalidData)).rejects.toThrow('Title must be less than 255 characters');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should create a user-only event (no petId) for the "calendario A" case', async () => {
      const dataWithoutPet: CreateEventDTO = {
        ...validData,
        petId: undefined,
      };

      const expectedEvent = CalendarEvent.create({
        userId: dataWithoutPet.userId,
        petId: null,
        title: dataWithoutPet.title,
        description: dataWithoutPet.description || null,
        eventType: dataWithoutPet.eventType,
        eventDate: dataWithoutPet.eventDate,
        reminderAt: dataWithoutPet.reminderAt || null,
        reminderEnabled: dataWithoutPet.reminderEnabled,
      });
      mockRepository.create.mockResolvedValue(expectedEvent);

      const result = await useCase.execute(dataWithoutPet);

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(result.petId).toBeNull();
    });

    it('should throw error if event date is missing', async () => {
      const invalidData = { 
        ...validData, 
        eventDate: undefined as unknown as Date
      };

      await expect(useCase.execute(invalidData as CreateEventDTO)).rejects.toThrow('Event date is required');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if event date is in the past', async () => {
      const invalidData: CreateEventDTO = { 
        ...validData, 
        eventDate: new Date('2023-01-01T10:00:00Z')
      };

      await expect(useCase.execute(invalidData)).rejects.toThrow('Event date cannot be in the past');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if event type is invalid', async () => {
      const invalidData = { 
        ...validData, 
        eventType: 'INVALID' as EventType,
        eventDate: new Date('2026-07-15T10:00:00Z')
      };

      await expect(useCase.execute(invalidData)).rejects.toThrow('Invalid event type');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should throw error if event type is invalid even with past date', async () => {
      const invalidData = { 
        ...validData, 
        eventType: 'INVALID' as EventType,
        eventDate: new Date('2023-01-01T10:00:00Z')
      };

      await expect(useCase.execute(invalidData)).rejects.toThrow('Event date cannot be in the past');
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should handle reminderAt as optional', async () => {
      const dataWithoutReminder: CreateEventDTO = { 
        ...validData, 
        reminderAt: undefined 
      };
      
      const expectedEvent = CalendarEvent.create({
        userId: dataWithoutReminder.userId,
        petId: dataWithoutReminder.petId || null,
        title: dataWithoutReminder.title,
        description: dataWithoutReminder.description || null,
        eventType: dataWithoutReminder.eventType,
        eventDate: dataWithoutReminder.eventDate,
        reminderAt: null,
        reminderEnabled: dataWithoutReminder.reminderEnabled,
      });
      mockRepository.create.mockResolvedValue(expectedEvent);

      const result = await useCase.execute(dataWithoutReminder);

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result.reminderAt).toBeNull();
    });

    it('should handle description as optional', async () => {
      const dataWithoutDescription: CreateEventDTO = { 
        ...validData, 
        description: undefined 
      };
      
      const expectedEvent = CalendarEvent.create({
        userId: dataWithoutDescription.userId,
        petId: dataWithoutDescription.petId || null,
        title: dataWithoutDescription.title,
        description: null,
        eventType: dataWithoutDescription.eventType,
        eventDate: dataWithoutDescription.eventDate,
        reminderAt: dataWithoutDescription.reminderAt || null,
        reminderEnabled: dataWithoutDescription.reminderEnabled,
      });
      mockRepository.create.mockResolvedValue(expectedEvent);

      const result = await useCase.execute(dataWithoutDescription);

      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(CalendarEvent);
      expect(result.description).toBeNull();
    });

    it('should handle all valid event types', async () => {
      const eventTypes = [
        EventType.VET_APPOINTMENT,
        EventType.MEDICATION,
        EventType.TREATMENT,
        EventType.GROOMING,
        EventType.OTHER
      ];

      for (const type of eventTypes) {
        const data: CreateEventDTO = { ...validData, eventType: type };
        const expectedEvent = CalendarEvent.create({
          userId: data.userId,
          petId: data.petId || null,
          title: data.title,
          description: data.description || null,
          eventType: data.eventType,
          eventDate: data.eventDate,
          reminderAt: data.reminderAt || null,
          reminderEnabled: data.reminderEnabled,
        });
        mockRepository.create.mockResolvedValue(expectedEvent);

        const result = await useCase.execute(data);

        expect(result.eventType).toBe(type);
        expect(mockRepository.create).toHaveBeenCalled();
        mockRepository.create.mockClear();
      }
    });
  });
});