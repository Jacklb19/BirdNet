import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { scheduleSynchronization } from './offlineClient';
import { SYNC_ERROR_EVENT } from './offline.constants';
import { queueStats } from './queueStore';
import type { QueueStats } from './types';
import { useQueueVersion } from './useQueueVersion';

const EMPTY: QueueStats = { count: 0, bytes: 0, waitingLocation: 0, waitingAccount: 0 };

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => { window.removeEventListener('online', onChange); window.removeEventListener('offline', onChange); };
}

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export interface QueueStatus {
  readonly stats: QueueStats;
  readonly online: boolean;
  /** The last background synchronization failed; cleared by the next successful manual attempt. */
  readonly syncFailed: boolean;
  readonly syncing: boolean;
  readonly syncNow: () => Promise<void>;
}

/** Pending records on this device and the state of their synchronization, read again after every queue change. */
export function useQueueStatus(): QueueStatus {
  const online = useOnline();
  const version = useQueueVersion('records');
  const [stats, setStats] = useState<QueueStats>(EMPTY);
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    queueStats().then((next) => { if (active) setStats(next); }).catch(() => { if (active) setSyncFailed(true); });
    return () => { active = false; };
  }, [version]);

  useEffect(() => {
    const failed = (): void => { setSyncFailed(true); };
    window.addEventListener(SYNC_ERROR_EVENT, failed);
    return () => { window.removeEventListener(SYNC_ERROR_EVENT, failed); };
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    setSyncing(true);
    try {
      // Acknowledged records are announced by the queue store, which refreshes the counters.
      await scheduleSynchronization();
      setSyncFailed(false);
    } catch {
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  }, []);

  return { stats, online, syncFailed, syncing, syncNow };
}
