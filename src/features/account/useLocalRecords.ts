import { useEffect, useState } from 'react';
import { listDetections, listHistory } from '../offline/queueStore';
import type { HistoryEntry, StoredDetection } from '../offline/types';
import { ownedBy } from '../offline/ownership';
import { useQueueVersion } from '../offline/useQueueVersion';
import { useAccountContext } from './accountContext';

/** What this phone keeps of the signed-in person: records waiting to upload and those the server already acknowledged. */
export interface LocalRecords {
  readonly pending: readonly StoredDetection[];
  readonly history: readonly HistoryEntry[];
}

export interface LocalRecordsState {
  /** Null while the local stores are being read. */
  readonly records: LocalRecords | null;
  readonly error: boolean;
}

const NO_RECORDS: LocalRecords = Object.freeze({ pending: [], history: [] });

const hasStorage = (): boolean => typeof indexedDB !== 'undefined';

/**
 * Reads the local stores again after every change to the records, made here, by the inference worker or by
 * background synchronization: a new song, an acknowledgement or a claim.
 */
export function useLocalRecords(): LocalRecordsState {
  const version = useQueueVersion('records');
  const userId = useAccountContext().identity?.userId ?? null;
  // Without IndexedDB nothing could ever be stored, so "no records" is the truthful answer rather than an error.
  const [state, setState] = useState<LocalRecordsState>(() => ({ records: hasStorage() ? null : NO_RECORDS, error: false }));

  useEffect(() => {
    if (!hasStorage()) return;
    let active = true;
    Promise.all([listDetections(), listHistory()])
      .then(([pending, history]) => { if (active) setState({ records: { pending: ownedBy(pending, userId), history: ownedBy(history, userId) }, error: false }); })
      .catch(() => { if (active) setState((previous) => ({ ...previous, error: true })); });
    return () => { active = false; };
  }, [version, userId]);

  return state;
}
