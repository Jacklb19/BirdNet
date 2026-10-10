import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { watchApproximateLocation } from '../audio/location';
import { useListening } from '../listen/listeningContext';
import { updateSettings } from '../offline/queueStore';
import type { ApproximateLocation, TrackPoint } from '../offline/types';
import { WALK_TRACK_MAX_POINTS, WALKS_KEPT_MAX } from './walk.config';
import { WalkContext, type WalkContextValue, type WalkFix } from './walkContext';
import { appendTrackPoint } from './walkGeometry';
import { saveWalk } from './walkStore';

interface LiveWalk {
  /** Start time of the session this state belongs to; a newer session ignores it. */
  readonly startedAt: number;
  readonly track: readonly TrackPoint[];
  readonly position: ApproximateLocation | null;
  readonly fix: WalkFix;
}

const keepsScreenOn = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Walk mode (ADR-25): while a session runs as a walk, the screen is kept on (a web page stops listening once the
 * phone locks), the position is followed, and the path is stored on this phone. The path never leaves the phone;
 * the songs heard along it are ordinary detections, pinned to the cell the person was in.
 */
export function WalkProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const session = useListening();
  const { walking, startedAt } = session;
  const [live, setLive] = useState<LiveWalk | null>(null);

  // Follows the position and stores the path; ends, with the walk's closing time, however the session stops.
  useEffect(() => {
    if (!walking || startedAt === null) return;
    const id = crypto.randomUUID();
    const started = new Date(startedAt).toISOString();
    let track: readonly TrackPoint[] = [];
    // The path is a convenience on top of the songs, which are stored on their own: a failed write loses a line
    // on the map, never a detection, so it does not interrupt the walk.
    const store = (endedAt: string | null): void => {
      void saveWalk({ id, startedAt: started, endedAt, track: [...track] }, WALKS_KEPT_MAX).catch(() => undefined);
    };
    const stopWatch = watchApproximateLocation((cell) => {
      if (!cell) {
        setLive((previous) => ({ startedAt, track, position: previous?.startedAt === startedAt ? previous.position : null, fix: 'lost' }));
        return;
      }
      const next = appendTrackPoint(track, cell, WALK_TRACK_MAX_POINTS);
      if (next !== track) {
        track = next;
        store(null);
      }
      setLive({ startedAt, track, position: cell, fix: 'found' });
    });
    return () => {
      stopWatch();
      if (track.length > 0) store(new Date().toISOString());
    };
  }, [walking, startedAt]);

  // Keeps the screen on. The browser releases the lock whenever the page is hidden, so it is taken again on return.
  useEffect(() => {
    if (!walking || !keepsScreenOn) return;
    let sentinel: WakeLockSentinel | null = null;
    let ended = false;
    const acquire = (): void => {
      navigator.wakeLock.request('screen')
        .then((lock) => {
          if (ended) void lock.release();
          else sentinel = lock;
        })
        // Refused while the page is hidden or the battery saver is on; the next return to the page tries again.
        .catch(() => undefined);
    };
    const onVisibility = (): void => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ended = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, [walking]);

  const { start: startSession, stop: stopSession } = session;
  const start = useCallback(async (): Promise<boolean> => {
    try {
      // A walk is drawn from the phone's position, so starting one is the person's choice to use it.
      await updateSettings({ locationEnabled: true });
    } catch {
      return false;
    }
    await startSession('walk');
    return true;
  }, [startSession]);

  const value = useMemo<WalkContextValue>(() => {
    const current = walking && live?.startedAt === startedAt ? live : null;
    return {
      walking,
      startedAt: walking ? startedAt : null,
      track: current?.track ?? [],
      position: current?.position ?? null,
      fix: current?.fix ?? 'searching',
      keepsScreenOn,
      start,
      stop: stopSession,
    };
  }, [walking, startedAt, live, start, stopSession]);

  return <WalkContext value={value}>{children}</WalkContext>;
}
