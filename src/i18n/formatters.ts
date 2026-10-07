/**
 * Locale-aware formatting of numbers, readings and dates with the standard Intl APIs. Callers pass the
 * interface locale; its region tag comes from `LOCALES`, so a new language formats correctly once listed there.
 */

import { intlTag, type Locale } from './locales';

/** Precision of readings (levels, latencies, sizes, durations) unless the caller needs another. */
export const DEFAULT_FRACTION_DIGITS = 1;

/**
 * Units Intl cannot format (they are not in ECMA-402's list of sanctioned units). Both are international
 * symbols, identical in every language, so they are not translated.
 */
const UNIT_SYMBOLS = Object.freeze({ hertz: 'Hz', decibelsFullScale: 'dBFS' });

/** No-break space: SI typesetting keeps a number and its unit symbol on the same line. */
const UNIT_SEPARATOR = '\u00A0';

/** Intl's 'megabyte' is the SI (decimal) megabyte. */
const BYTES_PER_MEGABYTE = 1_000_000;

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: 'medium', timeStyle: 'short' });

function fixedDigits(fractionDigits: number): Intl.NumberFormatOptions {
  return { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
}

/** Number with a unit Intl knows, in its short form ("24,6 ms", "3,0 s", "38,7 MB"). */
function formatUnit(value: number, unit: string, locale: Locale, fractionDigits: number): string {
  return formatNumber(value, locale, { style: 'unit', unit, unitDisplay: 'short', ...fixedDigits(fractionDigits) });
}

function withSymbol(formattedNumber: string, symbol: string): string {
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
  return withSymbol(formatNumber(valueHertz, locale, { maximumFractionDigits: 0 }), UNIT_SYMBOLS.hertz);
}

/**
 * Formats a duration or latency in milliseconds.
 * Example: 24.6 -> "24,6 ms" (es) vs "24.6 ms" (en).
 */
export function formatMilliseconds(ms: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatUnit(ms, 'millisecond', locale, fractionDigits);
}

/**
 * Formats a duration in seconds with the locale's own abbreviation.
 * Example: 3 -> "3,0 s" (es) vs "3.0 sec" (en).
 */
export function formatSeconds(seconds: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return formatUnit(seconds, 'second', locale, fractionDigits);
}

/**
 * Formats a level in decibels relative to full scale.
 * Example: -14.2 -> "-14,2 dBFS" (es) vs "-14.2 dBFS" (en).
 */
export function formatDecibels(db: number, locale: Locale, fractionDigits: number = DEFAULT_FRACTION_DIGITS): string {
  return withSymbol(formatDecimal(db, locale, fractionDigits), UNIT_SYMBOLS.decibelsFullScale);
}

/**
 * Formats a byte count in decimal megabytes.
 * Example: 38727042 -> "38,7 MB" (es) vs "38.7 MB" (en).
 */
export function formatBytes(bytes: number, locale: Locale): string {
  return formatUnit(bytes / BYTES_PER_MEGABYTE, 'megabyte', locale, DEFAULT_FRACTION_DIGITS);
}

/** Formats a date and time; `options` replace or extend the default medium date with short time. */
export function formatDate(date: Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlTag(locale), { ...DEFAULT_DATE_FORMAT, ...options }).format(date);
}
