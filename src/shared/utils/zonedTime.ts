// Conversión entre hora local de una zona IANA (p. ej. "America/Bogota") y UTC.
// Usa Intl (incluido en Node), sin dependencias externas.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

// Diferencia en ms entre la hora de pared de la zona y UTC, en el instante dado.
function offsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncatedUtc = Math.floor(date.getTime() / 1000) * 1000;
  return wallAsUtc - truncatedUtc;
}

// Convierte una hora de pared (año, mes 1-12, día, hora, minuto) en una zona a un Date UTC.
// Maneja cambios de horario de verano: el offset se recalcula en el instante resultante.
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAtNaive = offsetMs(new Date(naive), timeZone);
  let result = naive - offsetAtNaive;

  const offsetAtResult = offsetMs(new Date(result), timeZone);
  if (offsetAtResult !== offsetAtNaive) {
    result = naive - offsetAtResult;
  }

  return new Date(result);
}
