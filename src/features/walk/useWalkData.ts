import { useEffect, useMemo, useState } from 'react';
import { listDetections, listHistory } from '../offline/queueStore';
import type { HistoryEntry, StoredDetection, StoredWalk } from '../offline/types';
import { useQueueVersion } from '../offline/useQueueVersion';
import { toPins, type Pin } from './walkPins';
import { listWalks } from './walkStore';

export interface WalkData {
  /** The person's located songs, oldest first; null while the first read is in progress. */
  readonly pins: readonly Pin[] | null;
  readonly walks: readonly StoredWalk[];
  readonly error: boolean;
}

interface Stores {
  readonly pending: readonly StoredDetection[];
  readonly history: readonly HistoryEntry[];
  readonly walks: readonly StoredWalk[];
}

const NOTHING_STORED: Stores = Object.freeze({ pending: [], history: [], walks: [] });

/**
 * Everything the person's own map draws, read from the phone: it works offline and without an account. Read again
 * after every new song, synchronization or step of a walk.
 */
export function useWalkData(): WalkData {
  const records = useQueueVersion('records');
  const walks = useQueueVersion('walks');
  // Without IndexedDB nothing can have been stored, so the map is simply empty.
  const [stores, setStores] = useState<Stores | null>(() => (typeof indexedDB === 'undefined' ? NOTHING_STORED : null));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    // Pending first, then history: a record acknowledged between both reads is seen twice (and merged), never missed.
    listDetections()
      .then(async (pending) => ({ pending, history: await listHistory(), walks: await listWalks() }))
      .then((next) => { if (active) { setStores(next); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [records, walks]);

  const pins = useMemo(() => (stores ? toPins(stores.pending, stores.history) : null), [stores]);
  return { pins, walks: stores?.walks ?? NOTHING_STORED.walks, error };
}
