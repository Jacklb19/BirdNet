/**
 * Calendar arithmetic of the date field, on plain local calendar dates (no time zone is involved: the field edits
 * the local "YYYY-MM-DDTHH:mm" value a datetime-local input would hold, and the caller converts it as before).
 */
export interface CalendarDate {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly day: number;
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Day of the week of a date, 0 = Sunday, computed on UTC so no local offset or daylight change can shift it. */
export function weekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** The same day in another month, kept inside it (31 January plus one month is 28 or 29 February). */
export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function sameDate(left: CalendarDate | null, right: CalendarDate | null): boolean {
  return left !== null && right !== null && left.year === right.year && left.month === right.month && left.day === right.day;
}

export function compareDates(left: CalendarDate, right: CalendarDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

/**
 * The weeks drawn for a month, each of seven days starting on `firstDay` (0 = Sunday, 1 = Monday), with the days of
 * the months around it filling the first and last week, as on a printed calendar.
 */
export function monthGrid(year: number, month: number, firstDay: number): CalendarDate[][] {
  const first = { year, month, day: 1 };
  const lead = (weekday(first) - firstDay + 7) % 7;
  const count = Math.ceil((lead + daysInMonth(year, month)) / 7);
  const start = addDays(first, -lead);
  return Array.from({ length: count }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
}

/** A local date-time value split for the field, or null parts when it is empty or malformed. */
export function splitLocal(value: string): { readonly date: CalendarDate | null; readonly time: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return { date: null, time: '' };
  const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { date: null, time: '' };
  return { date: { year, month, day }, time: `${pad(hour)}:${pad(minute)}` };
}

/** "H:MM", "HH:MM", "HHMM" or "H" typed on a phone, as "HH:MM"; null when it is not a time of day. */
export function parseTime(text: string): string | null {
  const match = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*$/i.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  return hour <= 23 && minute <= 59 ? `${pad(hour)}:${pad(minute)}` : null;
}

export function joinLocal(date: CalendarDate, time: string): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}T${time}`;
}

interface WeekInfoLocale {
  readonly getWeekInfo?: () => { readonly firstDay: number };
  readonly weekInfo?: { readonly firstDay: number };
}

/**
 * First day of the week where the interface's language tag is used, 0 = Sunday (es-CO and en-US both start on
 * Sunday), from the browser's locale data; Sunday when the browser does not expose it.
 */
export function weekStart(intlTag: string): number {
  const locale = new Intl.Locale(intlTag) as Intl.Locale & WeekInfoLocale;
  const info = locale.getWeekInfo?.() ?? locale.weekInfo;
  // Intl numbers the days 1 = Monday … 7 = Sunday.
  return info ? info.firstDay % 7 : 0;
}

export function fromDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}
