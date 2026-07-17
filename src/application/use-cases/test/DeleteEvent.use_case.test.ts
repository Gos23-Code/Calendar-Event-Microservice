import { DeleteEventUseCase } from '../DeleteEventUseCase';
import { CalendarEvent } from '@/domain/entities/CalendarEvent';
import { EventType } from '@/domain/enums/EventType';

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

describe('DeleteEventUseCase', () => {
  let useCase: DeleteEventUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new DeleteEventUseCase(mockRepository);
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

  describe('execute', () => {
    it('should delete an event successfully', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);
      mockRepository.delete.mockResolvedValue(undefined);

      await useCase.execute(mockEvent.id, mockEvent.userId);

      expect(mockRepository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.delete).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.delete).toHaveBeenCalledTimes(1);
    });

    it('should throw error if event not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        useCase.execute('non-existent-id', 'user-123')
      ).rejects.toThrow('Event not found');

      expect(mockRepository.findById).toHaveBeenCalledWith('non-existent-id');
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error if user is not authorized', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);

      await expect(
        useCase.execute(mockEvent.id, 'wrong-user')
      ).rejects.toThrow('Unauthorized to delete this event');

      expect(mockRepository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error if id is empty', async () => {
      // Como en tu código primero busca y luego valida userId
      // findById retorna null para ID vacío
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        useCase.execute('', 'user-123')
      ).rejects.toThrow('Event not found'); // 👈 Cambiado a 'Event not found'

      expect(mockRepository.findById).toHaveBeenCalledWith('');
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error if userId is empty', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);

      await expect(
        useCase.execute(mockEvent.id, '')
      ).rejects.toThrow('Unauthorized to delete this event');

      expect(mockRepository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should handle deletion when repository throws error', async () => {
      mockRepository.findById.mockResolvedValue(mockEvent);
      mockRepository.delete.mockRejectedValue(new Error('Database error'));

      await expect(
        useCase.execute(mockEvent.id, mockEvent.userId)
      ).rejects.toThrow('Database error');

      expect(mockRepository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(mockRepository.delete).toHaveBeenCalledWith(mockEvent.id);
    });

    it('should work with different user IDs', async () => {
      const differentUserEvent = CalendarEvent.create({
        userId: 'user-456',
        petId: 'pet-789',
        title: 'Otro evento',
        description: 'Descripción de otro evento',
        eventType: EventType.MEDICATION,
        eventDate: new Date('2026-07-20T10:00:00Z'),
        reminderAt: new Date('2026-07-19T10:00:00Z'),
        reminderEnabled: false,
      });

      mockRepository.findById.mockResolvedValue(differentUserEvent);
      mockRepository.delete.mockResolvedValue(undefined);

      await useCase.execute(differentUserEvent.id, differentUserEvent.userId);

      expect(mockRepository.findById).toHaveBeenCalledWith(differentUserEvent.id);
      expect(mockRepository.delete).toHaveBeenCalledWith(differentUserEvent.id);
      expect(mockRepository.delete).toHaveBeenCalledTimes(1);
    });
  });
});