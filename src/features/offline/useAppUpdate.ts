import { useSyncExternalStore } from 'react';
import { applyUpdate, subscribeUpdate, updateReady } from './appUpdate';

export interface AppUpdate {
  /** A new version of the app is downloaded and waiting. */
  readonly ready: boolean;
  /** Takes it: the page reloads as the new version. */
  readonly apply: () => void;
}

/** The new version of the app waiting to be taken, if any (`appUpdate.ts`). */
export function useAppUpdate(): AppUpdate {
  const ready = useSyncExternalStore(subscribeUpdate, updateReady, () => false);
  return { ready, apply: applyUpdate };
}
