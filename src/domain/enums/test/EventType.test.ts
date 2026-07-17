import { EventType } from '../EventType';

describe('EventType Enum', () => {
  describe('Values', () => {
    it('should have all expected event types', () => {
      expect(EventType.VET_APPOINTMENT).toBe('VET_APPOINTMENT');
      expect(EventType.MEDICATION).toBe('MEDICATION');
      expect(EventType.TREATMENT).toBe('TREATMENT');
      expect(EventType.GROOMING).toBe('GROOMING');
      expect(EventType.OTHER).toBe('OTHER');
    });

    it('should have exactly 5 event types', () => {
      const values = Object.values(EventType);
      expect(values).toHaveLength(5);
    });

    it('should have correct keys', () => {
      const keys = Object.keys(EventType);
      expect(keys).toEqual([
        'VET_APPOINTMENT',
        'MEDICATION',
        'TREATMENT',
        'GROOMING',
        'OTHER'
      ]);
    });
  });

  describe('Validation', () => {
    it('should validate correct event types', () => {
      const validTypes = [
        EventType.VET_APPOINTMENT,
        EventType.MEDICATION,
        EventType.TREATMENT,
        EventType.GROOMING,
        EventType.OTHER
      ];

      validTypes.forEach(type => {
        expect(Object.values(EventType)).toContain(type);
      });
    });

    it('should reject invalid event types', () => {
      const invalidTypes = [
        'INVALID',
        'APPOINTMENT',
        'MEDICAL',
        'BATH',
        'WALK',
        'FEEDING',
        ''
      ];

      invalidTypes.forEach(type => {
        expect(Object.values(EventType)).not.toContain(type);
      });
    });

    it('should check if a string is a valid EventType', () => {
      const isValidEventType = (value: string): value is EventType => {
        return Object.values(EventType).includes(value as EventType);
      };

      expect(isValidEventType('VET_APPOINTMENT')).toBe(true);
      expect(isValidEventType('MEDICATION')).toBe(true);
      expect(isValidEventType('TREATMENT')).toBe(true);
      expect(isValidEventType('GROOMING')).toBe(true);
      expect(isValidEventType('OTHER')).toBe(true);
      expect(isValidEventType('INVALID')).toBe(false);
      expect(isValidEventType('APPOINTMENT')).toBe(false);
      expect(isValidEventType('')).toBe(false);
    });

    it('should validate event type using includes', () => {
      const isValid = (value: string): boolean => {
        return Object.values(EventType).includes(value as EventType);
      };

      expect(isValid('VET_APPOINTMENT')).toBe(true);
      expect(isValid('INVALID')).toBe(false);
    });
  });

  describe('Usage in functions', () => {
    it('should work in switch statements', () => {
      const getEventTypeLabel = (type: EventType): string => {
        switch (type) {
          case EventType.VET_APPOINTMENT:
            return 'Cita Veterinaria';
          case EventType.MEDICATION:
            return 'Medicación';
          case EventType.TREATMENT:
            return 'Tratamiento';
          case EventType.GROOMING:
            return 'Peluquería';
          case EventType.OTHER:
            return 'Otro';
          default:
            return 'Desconocido';
        }
      };

      expect(getEventTypeLabel(EventType.VET_APPOINTMENT)).toBe('Cita Veterinaria');
      expect(getEventTypeLabel(EventType.MEDICATION)).toBe('Medicación');
      expect(getEventTypeLabel(EventType.TREATMENT)).toBe('Tratamiento');
      expect(getEventTypeLabel(EventType.GROOMING)).toBe('Peluquería');
      expect(getEventTypeLabel(EventType.OTHER)).toBe('Otro');
    });

    it('should work in arrays and collections', () => {
      const eventTypes = [
        EventType.VET_APPOINTMENT,
        EventType.MEDICATION,
        EventType.GROOMING
      ];

      expect(eventTypes).toContain(EventType.VET_APPOINTMENT);
      expect(eventTypes).toContain(EventType.MEDICATION);
      expect(eventTypes).toContain(EventType.GROOMING);
      expect(eventTypes).not.toContain(EventType.TREATMENT);
      expect(eventTypes).not.toContain(EventType.OTHER);

      expect(eventTypes).toHaveLength(3);
    });

    it('should map to display names', () => {
      const eventTypeDisplayMap: Record<EventType, string> = {
        [EventType.VET_APPOINTMENT]: 'Cita Veterinaria',
        [EventType.MEDICATION]: 'Medicación',
        [EventType.TREATMENT]: 'Tratamiento',
        [EventType.GROOMING]: 'Peluquería',
        [EventType.OTHER]: 'Otro'
      };

      expect(eventTypeDisplayMap[EventType.VET_APPOINTMENT]).toBe('Cita Veterinaria');
      expect(eventTypeDisplayMap[EventType.MEDICATION]).toBe('Medicación');
      expect(eventTypeDisplayMap[EventType.TREATMENT]).toBe('Tratamiento');
      expect(eventTypeDisplayMap[EventType.GROOMING]).toBe('Peluquería');
      expect(eventTypeDisplayMap[EventType.OTHER]).toBe('Otro');
    });

    it('should have unique values', () => {
      const values = Object.values(EventType);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('Type safety', () => {
    it('should verify that valid enum values are accepted', () => {
      const validType: EventType = EventType.VET_APPOINTMENT;
      expect(validType).toBe('VET_APPOINTMENT');
      expect(typeof validType).toBe('string');
    });

    it('should check if a value is a valid EventType at runtime', () => {
      const isValidEventType = (value: unknown): boolean => {
        return typeof value === 'string' && 
               Object.values(EventType).includes(value as EventType);
      };

      expect(isValidEventType('VET_APPOINTMENT')).toBe(true);
      expect(isValidEventType('INVALID')).toBe(false);
      expect(isValidEventType(123)).toBe(false);
      expect(isValidEventType(null)).toBe(false);
      expect(isValidEventType(undefined)).toBe(false);
      expect(isValidEventType({})).toBe(false);
    });

    it('should allow iteration over values', () => {
      const types: EventType[] = [];
      for (const key in EventType) {
        if (isNaN(Number(key))) {
          types.push(EventType[key as keyof typeof EventType]);
        }
      }

      // Verificar que tenemos todos los tipos
      expect(types).toContain(EventType.VET_APPOINTMENT);
      expect(types).toContain(EventType.MEDICATION);
      expect(types).toContain(EventType.TREATMENT);
      expect(types).toContain(EventType.GROOMING);
      expect(types).toContain(EventType.OTHER);
      expect(types).toHaveLength(5);
    });

    it('should work with type guards', () => {
      const isEventType = (value: unknown): value is EventType => {
        return typeof value === 'string' && 
               Object.values(EventType).includes(value as EventType);
      };

      expect(isEventType('VET_APPOINTMENT')).toBe(true);
      expect(isEventType('INVALID')).toBe(false);
      expect(isEventType(123)).toBe(false);
      expect(isEventType(null)).toBe(false);
      expect(isEventType(undefined)).toBe(false);
    });

    it('should handle unknown values safely', () => {
      const safeProcess = (value: unknown): string => {
        if (typeof value === 'string' && Object.values(EventType).includes(value as EventType)) {
          return `Valid: ${value}`;
        }
        return 'Invalid';
      };

      expect(safeProcess('VET_APPOINTMENT')).toBe('Valid: VET_APPOINTMENT');
      expect(safeProcess('INVALID')).toBe('Invalid');
      expect(safeProcess(123)).toBe('Invalid');
      expect(safeProcess(null)).toBe('Invalid');
      expect(safeProcess(undefined)).toBe('Invalid');
    });
  });
});