import { createContext, useContext } from 'react';
import type { ApproximateLocation, TrackPoint } from '../offline/types';

/** What the position watch of a walk last reported. */
export type WalkFix = 'searching' | 'found' | 'lost';

export interface WalkContextValue {
  /** A walk is under way: listening, following the position and keeping the screen on. */
  readonly walking: boolean;
  /** Epoch milliseconds when the walk started; null when there is none. */
  readonly startedAt: number | null;
  /** Cells covered so far, in order. */
  readonly track: readonly TrackPoint[];
  /** The cell the person is in; null until the first fix. */
  readonly position: ApproximateLocation | null;
  readonly fix: WalkFix;
  /** Whether this browser can keep the screen on; without it the person has to keep it awake themselves. */
  readonly keepsScreenOn: boolean;
  /** Turns the location preference on and starts listening as a walk. Resolves false when that could not be stored. */
  readonly start: () => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export const WalkContext = createContext<WalkContextValue | null>(null);

/** The walk lives above the router, next to the listening session it belongs to. */
export function useWalk(): WalkContextValue {
  const value = useContext(WalkContext);
  if (!value) throw new Error('useWalk must be used inside WalkProvider.');
  return value;
}
