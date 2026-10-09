/** Checks for values read from API responses, shared by every feature client. */

export const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * ISO 8601 date-time as the API serializes it. `Date.parse` alone also accepts locale formats such as
 * "Oct 7, 2026", which the API never sends, so the layout is checked before the value.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));

export const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** Hours are grouped in the device's time zone, so a dawn chorus stays at dawn wherever the API runs. */
export function deviceTimeZone(fallback: string): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
}
