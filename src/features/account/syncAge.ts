const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * How long ago the last synchronization happened, in the coarsest unit that still reads naturally:
 * "just now" under a minute, whole minutes under an hour, whole hours under a day, then the date itself.
 */
export type SyncAge =
  | { readonly unit: 'justNow' }
  | { readonly unit: 'minutes'; readonly value: number }
  | { readonly unit: 'hours'; readonly value: number }
  | { readonly unit: 'date'; readonly date: Date };

/** Null when nothing was ever synchronized or the stored timestamp is unreadable. */
export function syncAge(syncedAt: string | null, now: number): SyncAge | null {
  if (!syncedAt) return null;
  const time = Date.parse(syncedAt);
  if (!Number.isFinite(time)) return null;
  // A timestamp slightly in the future only means the clocks disagree; it was still a moment ago.
  const elapsed = Math.max(0, now - time);
  if (elapsed < MS_PER_MINUTE) return { unit: 'justNow' };
  if (elapsed < MS_PER_HOUR) return { unit: 'minutes', value: Math.floor(elapsed / MS_PER_MINUTE) };
  if (elapsed < MS_PER_DAY) return { unit: 'hours', value: Math.floor(elapsed / MS_PER_HOUR) };
  return { unit: 'date', date: new Date(time) };
}
