import { periodDays, type Period } from '../../config/contract';
import { formatNumber } from '../../i18n/formatters';
import type { Locale } from '../../i18n/locales';
import { EXPORT_FALLBACK_SLUG, EXPORT_NAME_MAX_LENGTH, exportFileName } from './sites.config';

/** "+3", "−2": the change always carries its sign. */
export function formatSigned(delta: number, locale: Locale): string {
  return formatNumber(delta, locale, { signDisplay: 'exceptZero' });
}

export type SpeciesChange =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'same' }
  | { readonly kind: 'change'; readonly delta: number };

/** Species compared with the previous period; the whole record has nothing to compare with (`previous` is null). */
export function speciesChange(current: number, previous: number | null): SpeciesChange {
  if (previous === null) return { kind: 'unknown' };
  const delta = current - previous;
  return delta === 0 ? { kind: 'same' } : { kind: 'change', delta };
}

export type VisitsShare =
  | { readonly kind: 'only' }
  | { readonly kind: 'all' }
  | { readonly kind: 'some'; readonly days: number; readonly total: number };

/** How many of the period's visits (days with detections) a species was heard on. */
export function visitsShare(days: number, total: number): VisitsShare {
  if (total <= 1) return { kind: 'only' };
  return days >= total ? { kind: 'all' } : { kind: 'some', days, total };
}

export interface SpeciesPreview<T> { readonly visible: readonly T[]; readonly hidden: number }

/** First `limit` entries unless expanded; `hidden` is what the "See all" toggle reveals. */
export function previewSpecies<T>(list: readonly T[], expanded: boolean, limit: number): SpeciesPreview<T> {
  if (expanded || list.length <= limit) return { visible: list, hidden: 0 };
  return { visible: list.slice(0, limit), hidden: list.length - limit };
}

/** Calendar date in the device's time zone, as YYYY-MM-DD, so the file name matches the person's own day. */
export function localIsoDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Site name reduced to ASCII letters, digits and hyphens: safe on every file system and in every browser. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, EXPORT_NAME_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  return slug || EXPORT_FALLBACK_SLUG;
}

/** Start of a period counted back from `now`, the span the panel's statistics cover; null for the whole record. */
export function periodStart(period: Period, now: Date): Date | null {
  const days = periodDays(period);
  if (days === null) return null;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start;
}

export function exportFileNameFor(siteName: string, now: Date, since: Date | null): string {
  return exportFileName(fileSlug(siteName), since && localIsoDate(since), localIsoDate(now));
}

/** Day and month of a first sighting; the year only when it is not the year of the statistics. */
export function firstSeenFormat(firstSeen: Date, reference: Date): Intl.DateTimeFormatOptions {
  const sameYear = firstSeen.getFullYear() === reference.getFullYear();
  return { dateStyle: undefined, timeStyle: undefined, day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) };
}

/** A moment at the given local hour, only to format that hour with the locale's own clock (6:00 a. m., 6:00 AM). */
export function atLocalHour(reference: Date, hour: number): Date {
  const moment = new Date(reference);
  moment.setHours(hour, 0, 0, 0);
  return moment;
}
