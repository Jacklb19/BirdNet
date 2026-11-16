import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountContext } from '../account/accountContext';
import { registerAccountActivity } from '../account/sessionActivity';
import { scheduleSynchronization } from '../offline/offlineClient';
import { useOnline } from '../offline/useQueueStatus';
import { JOURNAL_CHANGED } from './journal.config';
import { readJournal } from './journalStore';
import { refreshJournal } from './journalSync';
import type { JournalSnapshot } from './types';

const live = (ref: { current: boolean }): boolean => ref.current;

/** Track writes and reads so deleting an account waits for its unfinished local work. */
export function useJournal() {
  const owner = useAccountContext().identity?.userId ?? null;
  const online = useOnline();
  const [snapshot, setSnapshot] = useState<JournalSnapshot>({ entities: [], relations: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const tasks = useRef(new Set<Promise<unknown>>());
  const abort = useRef(new AbortController());
  const reload = useCallback(async () => {
    if (!owner || !live(alive)) return;
    const next = await readJournal(owner);
    if (live(alive)) { setSnapshot(next); setReady(true); }
  }, [owner]);
  const run = useCallback(async (action: () => Promise<unknown>, sync = true): Promise<boolean> => {
    if (!owner || !live(alive)) return false;
    setError(false); setBusy(true);
    const task = action(); tasks.current.add(task);
    try {
      await task;
      if (live(alive)) { await reload(); if (sync) void scheduleSynchronization().catch(() => { if (live(alive)) setError(true); }); }
      return true;
    } catch (failure) {
      // A refresh cancelled because its screen closed (or was mounted again) is not a failure to report.
      const cancelled = failure instanceof DOMException && failure.name === 'AbortError';
      if (live(alive) && !cancelled) setError(true);
      return false;
    }
    finally { tasks.current.delete(task); if (live(alive)) setBusy(false); }
  }, [owner, reload]);
  const refresh = useCallback(() => run(async () => { if (owner) await refreshJournal(owner, abort.current.signal); }, false), [owner, run]);
  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    const update = (): void => { void reload().catch(() => { if (live(alive)) setError(true); }); };
    update();
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(JOURNAL_CHANGED) : null;
    if (channel) channel.onmessage = update;
    window.addEventListener(JOURNAL_CHANGED, update);
    const stop = async (): Promise<void> => { alive.current = false; abort.current.abort(); await Promise.allSettled([...tasks.current]); };
    const unregister = registerAccountActivity(stop);
    return () => { void stop().finally(unregister); channel?.close(); window.removeEventListener(JOURNAL_CHANGED, update); };
  }, [reload]);
  useEffect(() => { if (online && owner) void refresh(); }, [online, owner, refresh]);
  return { owner, online, ...snapshot, ready, error, busy, reload, run, refresh };
}
