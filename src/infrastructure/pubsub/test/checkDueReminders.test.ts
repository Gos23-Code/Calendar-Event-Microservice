import { checkDueReminders } from '../checkDueReminders';
import { supabase } from '@/infrastructure/database/supabase/client';
import { EventType } from '@/domain/enums/EventType';

jest.mock('@/infrastructure/database/supabase/client', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
  },
}));

const mockPublishReminderDue = jest.fn();
const mockPubSubService = { publishReminderDue: mockPublishReminderDue };

describe('checkDueReminders', () => {
  const dueRow = {
    id: 'event-1',
    user_id: 'user-123',
    pet_id: 'pet-456',
    title: 'Cita veterinaria',
    description: 'Revisión de Milo',
    event_type: EventType.VET_APPOINTMENT,
    start_date: '2026-07-15T10:00:00.000Z',
    end_date: '2026-07-15T11:00:00.000Z',
    location: 'Clínica Veterinaria Central',
    reminder_at: '2026-07-14T10:00:00.000Z',
    reminder_enabled: true,
    reminder_attempts: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };

  function mockSelect(data: unknown, error: unknown = null) {
    const selectQuery = {
      eq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockResolvedValue({ data, error }),
    };
    return selectQuery;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPublishReminderDue.mockResolvedValue('message-id-1');
  });

  it('should publish and mark as sent all due reminders', async () => {
    const selectQuery = mockSelect([dueRow]);
    const updateQuery = { eq: jest.fn().mockResolvedValue({ error: null }) };

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
      update: jest.fn().mockReturnValue(updateQuery),
    });

    const result = await checkDueReminders(new Date('2026-07-14T11:00:00.000Z'), mockPubSubService);

    expect(mockPublishReminderDue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ checked: 1, notified: ['event-1'], failed: [] });
  });

  it('should return an empty result when there are no due reminders', async () => {
    const selectQuery = mockSelect([]);

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
    });

    const result = await checkDueReminders(new Date(), mockPubSubService);

    expect(mockPublishReminderDue).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, notified: [], failed: [] });
  });

  it('should only query reminders below the max attempts threshold', async () => {
    const selectQuery = mockSelect([]);

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
    });

    await checkDueReminders(new Date(), mockPubSubService);

    expect(selectQuery.lt).toHaveBeenCalledWith('reminder_attempts', 3);
  });

  it('should throw if fetching due reminders fails', async () => {
    const selectQuery = mockSelect(null, { message: 'DB error' });

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
    });

    await expect(checkDueReminders(new Date(), mockPubSubService)).rejects.toThrow('Error fetching due reminders: DB error');
  });

  it('should record a failure and bump reminder_attempts without throwing if publishing fails', async () => {
    mockPublishReminderDue.mockRejectedValue(new Error('Pub/Sub unavailable'));

    const selectQuery = mockSelect([dueRow]);
    const updateQuery = { eq: jest.fn().mockResolvedValue({ error: null }) };
    const updateFn = jest.fn().mockReturnValue(updateQuery);

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
      update: updateFn,
    });

    const result = await checkDueReminders(new Date(), mockPubSubService);

    expect(result).toEqual({
      checked: 1,
      notified: [],
      failed: [{ id: 'event-1', error: 'Pub/Sub unavailable', attempts: 1, giveUp: false }],
    });
    expect(updateFn).toHaveBeenCalledWith({ reminder_attempts: 1 });
  });

  it('should mark giveUp=true once the attempt count reaches the max', async () => {
    mockPublishReminderDue.mockRejectedValue(new Error('Pub/Sub unavailable'));

    const rowOnLastAttempt = { ...dueRow, reminder_attempts: 2 };
    const selectQuery = mockSelect([rowOnLastAttempt]);
    const updateQuery = { eq: jest.fn().mockResolvedValue({ error: null }) };

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
      update: jest.fn().mockReturnValue(updateQuery),
    });

    const result = await checkDueReminders(new Date(), mockPubSubService);

    expect(result.failed).toEqual([
      { id: 'event-1', error: 'Pub/Sub unavailable', attempts: 3, giveUp: true },
    ]);
  });

  it('should record a failure if marking the reminder as sent fails', async () => {
    const selectQuery = mockSelect([dueRow]);
    const updateQuery = { eq: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }) };

    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue(selectQuery),
      update: jest.fn().mockReturnValue(updateQuery),
    });

    const result = await checkDueReminders(new Date(), mockPubSubService);

    expect(result.notified).toEqual([]);
    expect(result.failed).toEqual([{ id: 'event-1', error: 'Update failed', attempts: 1, giveUp: false }]);
  });
});
