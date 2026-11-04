import { useCallback, useEffect, useMemo, useState } from 'react';
import { listDetections, listHistory } from '../offline/queueStore';
import type { HistoryEntry, StoredDetection } from '../offline/types';
import { ownedBy } from '../offline/ownership';
import { useQueueVersion } from '../offline/useQueueVersion';
import { useAccountContext } from '../account/accountContext';
import { useReviews } from '../review/useReviews';
import { isPresence, mergeRecords, msUntilNextLocalDay, type LogRecord } from './logRecords';

export interface LogRecordsState {
  /** The records that count as presence of a bird: everything but what the person discarded. Null while the first read is in progress. */
  readonly records: readonly LogRecord[] | null;
  /** Every record, the discarded ones too, for the log itself, where a verdict can still be changed. */
  readonly everything: readonly LogRecord[] | null;
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
 * Every record of the signed-in person kept on this phone, pending or synchronized. The stores are read again after every change to the
 * records (added, acknowledged or claimed by an account), so records move from "waiting" to "uploaded" while the screen is open.
 */
export function useLogRecords(): LogRecordsState {
  const version = useQueueVersion('records');
  const userId = useAccountContext().identity?.userId ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback((): void => { setAttempt((value) => value + 1); }, []);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    // Pending first, then history: a record acknowledged between both reads is then seen twice (and merged), never missed.
    listDetections()
      .then(async (pending) => ({ pending: ownedBy(pending, userId), history: ownedBy(await listHistory(), userId) }))
      .then((stores) => { if (active) setSnapshot({ stores, readAt: new Date(), error: false }); })
      .catch(() => { if (active) setSnapshot((previous) => ({ ...previous, error: true })); });
    return () => { active = false; };
  }, [version, attempt, userId]);

  // A screen left open overnight would keep calling yesterday "today": read again when the local day changes.
  useEffect(() => {
    const timer = window.setTimeout(reload, msUntilNextLocalDay(snapshot.readAt));
    return () => { window.clearTimeout(timer); };
  }, [snapshot.readAt, reload]);

  const reviews = useReviews();
  const everything = useMemo(
    () => (snapshot.stores && reviews ? mergeRecords(snapshot.stores.pending, snapshot.stores.history, reviews) : null),
    [snapshot.stores, reviews],
  );
  const records = useMemo(() => everything?.filter(isPresence) ?? null, [everything]);
  return { records, everything, readAt: snapshot.readAt, error: snapshot.error, reload };
}
