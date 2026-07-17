import { ListEventsUseCase } from '../ListEventsUseCase';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';
import { EventFiltersDTO } from '../../dtos/CalendarEventDTO';

const mockRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByPetId: jest.fn(),
  findByUserAndFilters: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('ListEventsUseCase', () => {
  let useCase: ListEventsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListEventsUseCase(mockRepository);
  });

  const mockEvents = [
    CalendarEvent.create({
      userId: 'user-123',
      petId: 'pet-456',
      title: 'Evento 1',
      description: 'Descripción 1',
      eventType: EventType.VET_APPOINTMENT,
      eventDate: new Date('2026-07-15T10:00:00Z'),
      reminderAt: new Date('2026-07-14T10:00:00Z'),
      reminderEnabled: true,
    }),
    CalendarEvent.create({
      userId: 'user-123',
      petId: 'pet-456',
      title: 'Evento 2',
      description: 'Descripción 2',
      eventType: EventType.MEDICATION,
      eventDate: new Date('2026-07-16T10:00:00Z'),
      reminderAt: null,
      reminderEnabled: false,
    }),
  ];

  describe('execute', () => {
    it('should list events for a user', async () => {
      mockRepository.findByUserAndFilters.mockResolvedValue(mockEvents);

      const result = await useCase.execute('user-123');

      expect(mockRepository.findByUserAndFilters).toHaveBeenCalledWith('user-123', undefined);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(CalendarEvent);
    });

    it('should list events with filters', async () => {
      const filters: EventFiltersDTO = {
        petId: 'pet-456',
        eventType: EventType.VET_APPOINTMENT,
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
      };

      mockRepository.findByUserAndFilters.mockResolvedValue([mockEvents[0]]);

      const result = await useCase.execute('user-123', filters);

      expect(mockRepository.findByUserAndFilters).toHaveBeenCalledWith('user-123', filters);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe(EventType.VET_APPOINTMENT);
    });

    it('should throw error if userId is missing', async () => {
      await expect(useCase.execute('')).rejects.toThrow('User ID is required');
      expect(mockRepository.findByUserAndFilters).not.toHaveBeenCalled();
    });

    it('should return empty array if no events found', async () => {
      mockRepository.findByUserAndFilters.mockResolvedValue([]);

      const result = await useCase.execute('user-123');

      expect(result).toHaveLength(0);
    });
  });
});
