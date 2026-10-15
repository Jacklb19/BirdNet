/** Words and file names of a walk, from its stored values and the person's language. */
import { formatDate, type Locale } from '../../i18n';
import { fileSlug, localIsoDate } from '../sites/siteText';

/** The default date format sets date and time styles, which Intl does not allow next to individual fields. */
const NAME_DATE: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: undefined, timeStyle: undefined, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** The person's name for the walk, or one built from when it started ("Caminata del 15 oct, 7:05"). */
export function walkTitle(name: string | null | undefined, startedAt: number, locale: Locale, defaultName: (date: string) => string): string {
  return name ?? defaultName(formatDate(new Date(startedAt), locale, NAME_DATE));
}

/** "trino-humedal-al-alba-2026-10-15.gpx": ASCII only, safe on every file system. */
export function walkFileName(title: string, startedAt: number, extension: 'gpx' | 'csv'): string {
  return `trino-${fileSlug(title)}-${localIsoDate(new Date(startedAt))}.${extension}`;
}

/** A name as the person typed it: spaces collapsed, as the API stores it; empty means "use the date". */
export function cleanWalkName(typed: string): string | null {
  const name = typed.split(/\s+/).filter(Boolean).join(' ');
  return name || null;
}
