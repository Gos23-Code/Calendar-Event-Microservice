import { UpdateEventUseCase } from '../UpdateEventUseCase';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';

const mockRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findByPetId: jest.fn(),
  findByUserAndFilters: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('UpdateEventUseCase', () => {
  let useCase: UpdateEventUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new UpdateEventUseCase(mockRepository);
  });

  const mockEvent = CalendarEvent.create({
    userId: 'user-123',
    petId: 'pet-456',
    title: 'Cita original',
    description: 'Descripción original',
    eventType: EventType.VET_APPOINTMENT,
    eventDate: new Date('2026-07-15T10:00:00Z'),
    reminderAt: new Date('2026-07-14T10:00:00Z'),
    reminderEnabled: true,
  });

  describe('execute', () => {
    it('should update an event successfully', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);
      mockRepository.update.mockResolvedValue(mockEvent);

      const updateData = {
        title: 'Nuevo título',
        description: 'Nueva descripción',
        reminderEnabled: false,
      };

      const result = await useCase.execute(
        mockEvent.id,
        mockEvent.userId,
        updateData
      );

      expect(mockRepository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.update).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should throw error if event not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        useCase.execute('non-existent-id', 'user-123', {})
      ).rejects.toThrow('Event not found');
    });

    it('should throw error if user is not authorized', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);

      await expect(
        useCase.execute(mockEvent.id, 'wrong-user', {})
      ).rejects.toThrow('Unauthorized to update this event');
    });
  });
});
