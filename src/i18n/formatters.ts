/**
 * Locale-aware formatting of numbers, readings, counted phrases and dates with the standard Intl APIs. Callers
 * pass the interface locale; its region tag comes from `LOCALES`, so a new language formats correctly once listed there.
 */

import { intlTag, type Locale } from './locales';

/** Precision of readings (levels, latencies, sizes, durations) unless the caller needs another. */
export const DEFAULT_FRACTION_DIGITS = 1;

/**
 * Units Intl cannot format (they are not in ECMA-402's list of sanctioned units). All are international
 * symbols, identical in every language, so they are not translated.
 */
const UNIT_SYMBOLS = Object.freeze({ hertz: 'Hz', kilohertz: 'kHz', decibelsFullScale: 'dBFS' });

/** No-break space: SI typesetting keeps a number and its unit symbol on the same line. */
const UNIT_SEPARATOR = ' ';

/** Intl's 'megabyte' is the SI (decimal) megabyte. */
const BYTES_PER_MEGABYTE = 1_000_000;

const HERTZ_PER_KILOHERTZ = 1000;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
/** Calendar approximations for older moments; values are rounded down, so a phrase never sounds more recent than it is. */
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: 'medium', timeStyle: 'short' });

function fixedDigits(fractionDigits: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
}

/** Number with a unit Intl knows, in its short form ("24,6 ms", "3,0 s", "38,7 MB", "100 m"). */
function formatUnit(value: number, unit: string, locale: Locale, digits: Intl.NumberFormatOptions): string {
  return formatNumber(value, locale, { style: 'unit', unit, unitDisplay: 'short', ...digits });
}

function appendSymbol(formattedNumber: string, symbol: string): string {
  return `${formattedNumber}${UNIT_SEPARATOR}${symbol}`;
}

/** Formats a general number according to the active locale. */
export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlTag(locale), options).format(value);
}

/**
 * Formats a decimal number with a fixed number of fraction digits.
 * Example: 48.3 -> "48,3" (es) vs "48.3" (en).
 */
export function formatDecimal(value: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatNumber(value, locale, fixedDigits(fractionDigits));
}

/**
 * Formats a ratio [0.0 - 1.0] as a localized percentage.
 * Example: 0.895 -> "89,5 %" (es) vs "89.5%" (en).
 */
export function formatPercent(ratio: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatNumber(ratio, locale, { style: 'percent', ...fixedDigits(fractionDigits) });
}

/**
 * Formats a frequency in whole hertz.
 * Example: 48000 -> "48.000 Hz" (es) vs "48,000 Hz" (en).
 */
export function formatFrequency(valueHertz: number, locale: Locale): string {
  return appendSymbol(formatNumber(valueHertz, locale, { maximumFractionDigits: 0 }), UNIT_SYMBOLS.hertz);
}

export interface KilohertzOptions {
  /** False for axis labels that share the unit written once on another label. */
  readonly withSymbol?: boolean;
}

/**
 * Formats a frequency given in hertz as kilohertz, with at most one decimal.
 * Example: 15000 -> "15 kHz"; 1500 -> "1,5 kHz" (es) vs "1.5 kHz" (en).
 */
export function formatKilohertz(valueHertz: number, locale: Locale, { withSymbol = true }: KilohertzOptions = {}): string {
  const value = formatNumber(valueHertz / HERTZ_PER_KILOHERTZ, locale, { maximumFractionDigits: DEFAULT_FRACTION_DIGITS });
  return withSymbol ? appendSymbol(value, UNIT_SYMBOLS.kilohertz) : value;
}

/**
 * Formats a duration or latency in milliseconds.
 * Example: 24.6 -> "24,6 ms" (es) vs "24.6 ms" (en).
 */
export function formatMilliseconds(ms: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatUnit(ms, 'millisecond', locale, fixedDigits(fractionDigits));
}

/**
 * Formats a duration in seconds with the locale's own abbreviation.
 * Example: 3 -> "3,0 s" (es) vs "3.0 sec" (en).
 */
export function formatSeconds(seconds: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatUnit(seconds, 'second', locale, fixedDigits(fractionDigits));
}

/**
 * Formats a level in decibels relative to full scale.
 * Example: -14.2 -> "-14,2 dBFS" (es) vs "-14.2 dBFS" (en).
 */
export function formatDecibels(db: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return appendSymbol(formatDecimal(db, locale, fractionDigits), UNIT_SYMBOLS.decibelsFullScale);
}

/**
 * Formats a byte count in decimal megabytes.
 * Example: 38727042 -> "38,7 MB" (es) vs "38.7 MB" (en).
 */
export function formatBytes(bytes: number, locale: Locale): string {
  return formatUnit(bytes / BYTES_PER_MEGABYTE, 'megabyte', locale, fixedDigits(DEFAULT_FRACTION_DIGITS));
}

/**
 * Formats a distance in whole metres with the locale's unit symbol.
 * Example: 100 -> "100 m" (es and en).
 */
export function formatMeters(meters: number, locale: Locale): string {
  return formatUnit(meters, 'meter', locale, { maximumFractionDigits: 0 });
}

/** Formats a date and time; `options` replace or extend the default medium date with short time. */
export function formatDate(date: Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlTag(locale), { ...DEFAULT_DATE_FORMAT, ...options }).format(date);
}

/**
 * Forms of a counted phrase by Intl.PluralRules category. Every language gives "one" and "other"; a category
 * a translation leaves out (such as the Spanish "many" of round millions) takes the "other" form.
 */
export type PluralForms<T> = Readonly<{ one: T; other: T }> & Partial<Readonly<Record<Intl.LDMLPluralRule, T>>>;

/** The form the language's plural rules choose for `count`. */
export function selectPlural<T>(forms: PluralForms<T>, count: number, locale: Locale): T {
  return forms[new Intl.PluralRules(intlTag(locale)).select(count)] ?? forms.other;
}

/**
 * Counted phrase with the number formatted for the locale; the translation places the number.
 * Example: 1 -> "1 canto", 1500 -> "1.500 cantos" (es) vs "1,500 songs" (en).
 */
export function formatCount(forms: PluralForms<(count: string) => string>, count: number, locale: Locale): string {
  return selectPlural(forms, count, locale)(formatNumber(count, locale));
}

export interface RelativeTime {
  /** Negative for the past, as Intl.RelativeTimeFormat expects; 0 seconds reads as "now". */
  readonly value: number;
  readonly unit: Intl.RelativeTimeFormatUnit;
}

/** Whole local calendar days between two instants; rounding absorbs the hour a daylight-saving change adds or removes. */
function calendarDaysBetween(earlier: Date, later: Date): number {
  const start = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const end = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/**
 * How long ago `then` was, in the largest unit that keeps the number small. Under a day it counts elapsed
 * minutes or hours; from there on it counts calendar days, so "yesterday" always means the previous date.
 * Times in the future (a clock ahead of this device) read as "now".
 */
export function relativeTime(then: Date, now: Date): RelativeTime {
  const minutes = Math.floor((now.getTime() - then.getTime()) / MS_PER_MINUTE);
  if (minutes < 1) return { value: 0, unit: 'second' };
  if (minutes < MINUTES_PER_HOUR) return { value: -minutes, unit: 'minute' };
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return { value: -hours, unit: 'hour' };
  const days = calendarDaysBetween(then, now);
  if (days < DAYS_PER_WEEK) return { value: -days, unit: 'day' };
  if (days < DAYS_PER_MONTH) return { value: -Math.floor(days / DAYS_PER_WEEK), unit: 'week' };
  if (days < DAYS_PER_YEAR) return { value: -Math.floor(days / DAYS_PER_MONTH), unit: 'month' };
  return { value: -Math.floor(days / DAYS_PER_YEAR), unit: 'year' };
}

/**
 * How long ago, in the short style and with the language's words for adjacent days.
 * Example: "hace 2 h", "ayer" (es) vs "2 hr. ago", "yesterday" (en).
 */
export function formatRelativeTime(then: Date, now: Date, locale: Locale): string {
  const { value, unit } = relativeTime(then, now);
  return new Intl.RelativeTimeFormat(intlTag(locale), { numeric: 'auto', style: 'short' }).format(value, unit);
}
