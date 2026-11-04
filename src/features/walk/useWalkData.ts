import { useEffect, useMemo, useState } from 'react';
import { listDetections, listHistory } from '../offline/queueStore';
import type { HistoryEntry, StoredDetection, StoredWalk } from '../offline/types';
import { ownedBy } from '../offline/ownership';
import { useQueueVersion } from '../offline/useQueueVersion';
import { useAccountContext } from '../account/accountContext';
import { applyReviews } from '../review/reviewPolicy';
import { useReviews } from '../review/useReviews';
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
 * Everything the person's own map draws, read from the phone: it works offline, with only what is theirs. Read again
 * after every new song, synchronization or step of a walk.
 */
export function useWalkData(): WalkData {
  const records = useQueueVersion('records');
  const walks = useQueueVersion('walks');
  const reviews = useReviews();
  const userId = useAccountContext().identity?.userId ?? null;
  // Without IndexedDB nothing can have been stored, so the map is simply empty.
  const [stores, setStores] = useState<Stores | null>(() => (typeof indexedDB === 'undefined' ? NOTHING_STORED : null));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    // Pending first, then history: a record acknowledged between both reads is seen twice (and merged), never missed.
    listDetections()
      .then(async (pending) => ({ pending: ownedBy(pending, userId), history: ownedBy(await listHistory(), userId), walks: ownedBy(await listWalks(), userId) }))
      .then((next) => { if (active) { setStores(next); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [records, walks, userId]);

  // The map draws presence: what the person discarded is left out and what they corrected shows the bird they heard.
  const pins = useMemo(() => (stores && reviews ? toPins(applyReviews(stores.pending, reviews), applyReviews(stores.history, reviews)) : null), [stores, reviews]);
  return { pins, walks: stores?.walks ?? NOTHING_STORED.walks, error };
}
