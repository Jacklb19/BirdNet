import type { StoredDetection } from '../offline/types';

/**
 * Pending records of the signed-in person, split by whether synchronization can take them: the queue only
 * uploads records owned by the session's user that carry an approximate location; the rest stay on the phone.
 */
export interface PendingSync {
  readonly uploadable: number;
  readonly withoutLocation: number;
}

type PendingRow = Pick<StoredDetection, 'owner' | 'location' | 'metadataSynced'>;

/**
 * Records without an owner are left out: the claim card asks about them before they count as the person's.
 * A record whose song the server already acknowledged only stays queued for its doubtful audio fragment, which
 * uploads only with consent; without it the fragment stays on the phone and the song counts as synchronized.
 */
export function pendingSync(rows: readonly PendingRow[], userId: string, audioConsent: boolean): PendingSync {
  let uploadable = 0;
  let withoutLocation = 0;
  for (const row of rows) {
    if (row.owner !== userId) continue;
    if (!row.location) withoutLocation += 1;
    else if (!row.metadataSynced || audioConsent) uploadable += 1;
  }
  return { uploadable, withoutLocation };
}

export type SyncPhase = 'syncing' | 'synced' | 'offline' | 'failed' | 'pending';

export interface SyncConditions {
  readonly uploadable: number;
  readonly online: boolean;
  readonly syncing: boolean;
  readonly syncFailed: boolean;
}

/**
 * The single state the profile card reports. "Synced" means nothing that could upload is left, so records
 * that can never upload (no location) do not keep it waiting forever; they are reported on their own line.
 */
export function syncPhase({ uploadable, online, syncing, syncFailed }: SyncConditions): SyncPhase {
  if (syncing) return 'syncing';
  if (uploadable === 0) return 'synced';
  if (!online) return 'offline';
  return syncFailed ? 'failed' : 'pending';
}
