import { useSyncExternalStore } from 'react';
import type { QueueChangePart } from './offline.constants';
import { queueVersion, subscribeQueueChanges } from './queueChanges';

/**
 * A number that changes after every committed change to one part of the queue database, made in this page, the
 * inference worker or the service worker (new songs, synchronization acknowledgements, claims, settings). Use it
 * as an effect dependency to read the stores again.
 */
export function useQueueVersion(part: QueueChangePart): number {
  return useSyncExternalStore(subscribeQueueChanges, () => queueVersion(part));
}
