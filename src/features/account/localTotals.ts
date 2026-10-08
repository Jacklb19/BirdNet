import type { HistoryEntry, StoredDetection } from '../offline/types';

/** What this phone holds: every song it recorded (pending or already synchronized) and how many species they cover. */
export interface LocalTotals {
  readonly songs: number;
  readonly species: number;
  /** Most recent acknowledgement from the server, or null when nothing was synchronized yet. */
  readonly lastSyncedAt: string | null;
}

type PendingRow = Pick<StoredDetection, 'id' | 'species'>;
type HistoryRow = Pick<HistoryEntry, 'id' | 'species' | 'syncedAt'>;

/**
 * Pending and synchronized records are separate stores, but a record moves between them in one transaction;
 * counting distinct ids keeps a record that was read mid-move from being counted twice.
 */
export function localTotals(pending: readonly PendingRow[], history: readonly HistoryRow[]): LocalTotals {
  const ids = new Set<string>();
  const species = new Set<string>();
  for (const row of [...pending, ...history]) {
    ids.add(row.id);
    species.add(row.species);
  }
  let lastSyncedAt: string | null = null;
  let lastTime = Number.NEGATIVE_INFINITY;
  for (const row of history) {
    const time = Date.parse(row.syncedAt);
    if (Number.isFinite(time) && time > lastTime) {
      lastTime = time;
      lastSyncedAt = row.syncedAt;
    }
  }
  return { songs: ids.size, species: species.size, lastSyncedAt };
}
