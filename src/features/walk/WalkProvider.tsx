import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { screenAwakeSupported, useScreenAwake } from '../../shared/useScreenAwake';
import { watchApproximateLocation } from '../audio/location';
import { useListening } from '../listen/listeningContext';
import { getSettings, updateSettings } from '../offline/queueStore';
import type { ApproximateLocation, TrackPoint } from '../offline/types';
import { WALK_HEARTBEAT_MS, WALK_TRACK_MAX_POINTS, WALKS_KEPT_MAX } from './walk.config';
import { WalkContext, type WalkContextValue, type WalkFix } from './walkContext';
import { appendTrackPoint } from './walkGeometry';
import { saveWalk } from './walkStore';

const MILLISECONDS_PER_SECOND = 1000;

interface LiveWalk {
  /** Start time of the session this state belongs to; a newer session ignores it. */
  readonly startedAt: number;
  readonly track: readonly TrackPoint[];
  readonly position: ApproximateLocation | null;
  readonly fix: WalkFix;
}

/**
 * Walk mode (ADR-25): while a session runs as a walk, the screen is kept on (a web page stops listening once the
 * phone locks), the position is followed, and the path is stored on this phone, cell by cell with its time. The
 * path leaves the phone only if the person chose to save walks in their account (ADR-35); the songs heard along it
 * are ordinary detections, pinned to the cell the person was in.
 */
export function WalkProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const session = useListening();
  const { walking, startedAt } = session;
  const [live, setLive] = useState<LiveWalk | null>(null);
  const [finished, setFinished] = useState<string | null>(null);

  // Follows the position and stores the path; ends, with the walk's closing time, however the session stops.
  useEffect(() => {
    if (!walking || startedAt === null) return;
    const id = crypto.randomUUID();
    const started = new Date(startedAt).toISOString();
    let track: readonly TrackPoint[] = [];
    // The account signed in when the walk starts is the one it can be saved to.
    let owner: string | null = null;
    // Writes go one after another, so a late refresh can never overwrite the closed walk.
    let writes = getSettings().then((settings) => { owner = settings.session?.userId ?? null; }, () => undefined);
    // The path is a convenience on top of the songs, which are stored on their own: a failed write loses a line
    // on the map, never a detection, so it does not interrupt the walk.
    const store = (endedAt: string | null): void => {
      const lastAt = new Date().toISOString();
      const points = [...track];
      writes = writes.then(() => saveWalk({ id, startedAt: started, endedAt, track: points, lastAt, owner }, WALKS_KEPT_MAX)).catch(() => undefined);
    };
    const stopWatch = watchApproximateLocation((cell) => {
      if (!cell) {
        setLive((previous) => ({ startedAt, track, position: previous?.startedAt === startedAt ? previous.position : null, fix: 'lost' }));
        return;
      }
      const next = appendTrackPoint(track, cell, WALK_TRACK_MAX_POINTS, (Date.now() - startedAt) / MILLISECONDS_PER_SECOND);
      if (next !== track) {
        track = next;
        store(null);
      }
      setLive({ startedAt, track, position: cell, fix: 'found' });
    });
    // Standing still stores nothing new, so the walk is refreshed now and then: an interrupted one still knows
    // roughly when it ended.
    const heartbeat = window.setInterval(() => { if (track.length > 0) store(null); }, WALK_HEARTBEAT_MS);
    return () => {
      stopWatch();
      window.clearInterval(heartbeat);
      if (track.length > 0) {
        store(new Date().toISOString());
        setFinished(id);
      }
    };
  }, [walking, startedAt]);

  useScreenAwake(walking);

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

  const dismissFinished = useCallback((): void => { setFinished(null); }, []);

  const value = useMemo<WalkContextValue>(() => {
    const current = walking && live?.startedAt === startedAt ? live : null;
    return {
      walking,
      startedAt: walking ? startedAt : null,
      track: current?.track ?? [],
      position: current?.position ?? null,
      fix: current?.fix ?? 'searching',
      keepsScreenOn: screenAwakeSupported,
      finished: walking ? null : finished,
      start,
      stop: stopSession,
      dismissFinished,
    };
  }, [walking, startedAt, live, finished, start, stopSession, dismissFinished]);

  return <WalkContext value={value}>{children}</WalkContext>;
}
