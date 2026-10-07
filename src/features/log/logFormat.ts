/** Formatting choices of the log screens, on top of the locale-aware formatters of src/i18n. */
import { formatDate, formatPercent, type Locale } from '../../i18n';
import { CONFIDENCE_FRACTION_DIGITS, LOG_TIME_FORMAT } from './log.config';

/** The default date format sets date and time styles, which Intl does not allow next to individual fields. */
const NO_STYLES: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: undefined, timeStyle: undefined });

/** Day and month, plus the year only when it is not the current one. */
function dateFields(day: Date, now: Date): Intl.DateTimeFormatOptions {
  return { day: 'numeric', month: 'long', year: day.getFullYear() === now.getFullYear() ? undefined : 'numeric' };
}

export function formatTime(time: number, locale: Locale): string {
  return formatDate(new Date(time), locale, { ...NO_STYLES, ...LOG_TIME_FORMAT });
}

/** Weekday and date of a day heading. */
export function formatDayHeading(day: Date, now: Date, locale: Locale): string {
  return formatDate(day, locale, { ...NO_STYLES, weekday: 'long', ...dateFields(day, now) });
}

/** Date and time of a record older than yesterday, in the same clock as the rest of the log. */
export function formatDayTime(time: number, now: Date, locale: Locale): string {
  const date = new Date(time);
  return formatDate(date, locale, { ...NO_STYLES, ...dateFields(date, now), ...LOG_TIME_FORMAT });
}

export function formatConfidence(ratio: number, locale: Locale): string {
  return formatPercent(ratio, locale, CONFIDENCE_FRACTION_DIGITS);
}
