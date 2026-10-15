import { useMemo, useSyncExternalStore } from 'react';
import { alternateSnapshot, alternateUsable, downloadAlternate, removeAlternate, subscribeAlternate, type AlternateSnapshot } from './alternateStore';

export interface AlternateStatus extends AlternateSnapshot {
  /** A choice that needs the second model takes effect now. */
  readonly usable: boolean;
  /** Starts the download, or joins the one already running; `title` names it among the downloads of the system. */
  readonly download: (title: string) => Promise<void>;
  readonly remove: () => Promise<void>;
}

/** The second acoustic model a person may add (ADR-31): whether it is on the device, and how to get or drop it. */
export function useAlternateModel(): AlternateStatus {
  const snapshot = useSyncExternalStore(subscribeAlternate, alternateSnapshot);
  return useMemo(() => ({ ...snapshot, usable: alternateUsable(snapshot), download: downloadAlternate, remove: removeAlternate }), [snapshot]);
}
