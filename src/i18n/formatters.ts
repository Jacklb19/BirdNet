/**
 * Internationalization formatting utilities using standard Intl APIs.
 * Ensures consistent localized formatting for numbers, percentages, frequencies, and units.
 */

import type { Locale } from './types';

/**
 * Maps application locale to BCP 47 language tag.
 */
function getIntlLocale(locale: Locale): string {
  return locale === 'es' ? 'es-CO' : 'en-US';
}

/**
 * Formats a general number according to the active locale.
 */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

/**
 * Formats a decimal number with fixed minimum and maximum fraction digits.
 * Example: 48.3 -> "48,3" (es) vs "48.3" (en).
 */
export function formatDecimal(
  value: number,
  locale: Locale,
  fractionDigits: number = 1,
): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Formats a ratio [0.0 - 1.0] as a localized percentage.
 * Example: 0.895 -> "89,5 %" (es) vs "89.5%" (en).
 */
export function formatPercent(
  ratio: number,
  locale: Locale,
  fractionDigits: number = 1,
): string {
  return formatNumber(ratio, locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Formats frequency in Hertz / kiloHertz.
 * Example: 48000 -> "48.000 Hz" (es) vs "48,000 Hz" (en).
 */
export function formatFrequency(valueHertz: number, locale: Locale): string {
  const formattedNumber = formatNumber(valueHertz, locale, {
    maximumFractionDigits: 0,
  });
  return `${formattedNumber} Hz`;
}

/**
 * Formats duration / latency in milliseconds.
 * Example: 24.6 -> "24,6 ms" (es) vs "24.6 ms" (en).
 */
export function formatMilliseconds(ms: number, locale: Locale, fractionDigits: number = 1): string {
  const formattedNumber = formatDecimal(ms, locale, fractionDigits);
  return `${formattedNumber} ms`;
}

/**
 * Formats decibels (dBFS).
 * Example: -14.2 -> "-14,2 dBFS" (es) vs "-14.2 dBFS" (en).
 */
export function formatDecibels(db: number, locale: Locale, fractionDigits: number = 1): string {
  const formattedNumber = formatDecimal(db, locale, fractionDigits);
  return `${formattedNumber} dBFS`;
}

/**
 * Formats byte size into human readable Megabytes / Kilobytes.
 * Example: 38727042 -> "36,9 MB" (es) vs "36.9 MB" (en).
 */
export function formatBytes(bytes: number, locale: Locale): string {
  const mb = bytes / (1024 * 1024);
  const formattedNumber = formatDecimal(mb, locale, 1);
  return `${formattedNumber} MB`;
}

/**
 * Formats a Date object using localized Intl.DateTimeFormat.
 */
export function formatDate(
  date: Date,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  };
  return new Intl.DateTimeFormat(getIntlLocale(locale), defaultOptions).format(date);
}
