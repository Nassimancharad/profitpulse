const DEFAULT_TIMEZONE = 'UTC';

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getTimeParts(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.get('year') ?? 0),
    month: Number(byType.get('month') ?? 1),
    day: Number(byType.get('day') ?? 1),
    hour: Number(byType.get('hour') ?? 0),
    minute: Number(byType.get('minute') ?? 0),
    second: Number(byType.get('second') ?? 0),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeParts(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return utcFromParts - date.getTime();
}

function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}, timeZone: string) {
  const utcGuess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute ?? 0,
    input.second ?? 0,
    input.millisecond ?? 0,
  );
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

export function normalizeShopTimezone(value: string | null | undefined) {
  if (!value) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function toTimeZoneDateKey(date: Date, timeZone: string) {
  const parts = getTimeParts(date, normalizeShopTimezone(timeZone));
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function parseDateKey(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dayBoundsForDateKey(dateKey: string, timeZone: string) {
  const parsed = parseDateKey(dateKey);
  const tz = normalizeShopTimezone(timeZone);
  if (!parsed) {
    const now = new Date();
    return {
      start: zonedDateTimeToUtc({
        ...getTimeParts(now, tz),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      }, tz),
      end: new Date(now),
    };
  }

  const start = zonedDateTimeToUtc(
    { year: parsed.year, month: parsed.month, day: parsed.day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    tz,
  );
  const nextDateKey = addDaysToDateKey(dateKey, 1);
  const nextParsed = parseDateKey(nextDateKey)!;
  const nextStart = zonedDateTimeToUtc(
    { year: nextParsed.year, month: nextParsed.month, day: nextParsed.day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    tz,
  );
  return {
    start,
    end: new Date(nextStart.getTime() - 1),
  };
}

export function formatDateForTimezone(date: Date, timeZone: string) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone });
}
