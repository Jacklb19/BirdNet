import { useCallback, useEffect, useMemo, useState } from 'react';
import { listDetections, listHistory } from '../offline/queueStore';
import type { HistoryEntry, StoredDetection } from '../offline/types';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useQueueVersion } from '../offline/useQueueVersion';
import { mergeRecords, msUntilNextLocalDay, type LogRecord, type SyncUser } from './logRecords';

export interface LogRecordsState {
  /** Null while the first read is in progress. */
  readonly records: readonly LogRecord[] | null;
  /** When the records were read; day labels ("today", "yesterday") are relative to it. */
  readonly readAt: Date;
  readonly error: boolean;
  readonly reload: () => void;
}

interface Stores {
  readonly pending: readonly StoredDetection[];
  readonly history: readonly HistoryEntry[];
}

interface Snapshot {
  readonly stores: Stores | null;
  readonly readAt: Date;
  readonly error: boolean;
}

/** Without IndexedDB nothing can have been stored, so the log is simply empty. */
const initialSnapshot = (): Snapshot => ({
  stores: typeof indexedDB === 'undefined' ? { pending: [], history: [] } : null, readAt: new Date(), error: false,
});

/**
 * Every record kept on this phone, pending or synchronized. The stores are read again after every change to the
 * records (added, acknowledged, even when only the song was acknowledged and its fragment still waits, or claimed
 * by an account), so records move from "waiting" to "uploaded" while the screen is open.
 */
export function useLogRecords(): LogRecordsState {
  const version = useQueueVersion('records');
  // Read again after every settings change, so signing in or out elsewhere updates the upload state here.
  const { settings } = useOfflineSettings();
  // The session synchronization actually uses, not the auth state: it decides which owned records can upload.
  const syncUser: SyncUser = settings ? settings.session?.userId ?? null : undefined;
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback((): void => { setAttempt((value) => value + 1); }, []);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    // Pending first, then history: a record acknowledged between both reads is then seen twice (and merged), never missed.
    listDetections()
      .then(async (pending) => ({ pending, history: await listHistory() }))
      .then((stores) => { if (active) setSnapshot({ stores, readAt: new Date(), error: false }); })
      .catch(() => { if (active) setSnapshot((previous) => ({ ...previous, error: true })); });
    return () => { active = false; };
  }, [version, attempt]);

  // A screen left open overnight would keep calling yesterday "today": read again when the local day changes.
  useEffect(() => {
    const timer = window.setTimeout(reload, msUntilNextLocalDay(snapshot.readAt));
    return () => { window.clearTimeout(timer); };
  }, [snapshot.readAt, reload]);

  const records = useMemo(
    () => (snapshot.stores ? mergeRecords(snapshot.stores.pending, snapshot.stores.history, syncUser) : null),
    [snapshot.stores, syncUser],
  );
  return { records, readAt: snapshot.readAt, error: snapshot.error, reload };
}
