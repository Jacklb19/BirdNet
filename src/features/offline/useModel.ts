import { useMemo, useSyncExternalStore } from 'react';
import { checkModel, downloadModel, modelSnapshot, subscribeModel, type ModelSnapshot } from './modelStore';

export type { ModelProgress, ModelSnapshot, ModelState, UpdateCheck } from './modelStore';

export interface ModelStatus extends ModelSnapshot {
  /** Starts the download, or joins the one already running on any screen. */
  readonly download: () => Promise<void>;
  /** Compares with the published model; the outcome is reported in `updateCheck`. */
  readonly checkForUpdate: () => Promise<void>;
}

/** Download, verification and update of the identification model: one shared state for Welcome, Listen and Settings. */
export function useModel(): ModelStatus {
  const snapshot = useSyncExternalStore(subscribeModel, modelSnapshot);
  return useMemo(() => ({ ...snapshot, download: downloadModel, checkForUpdate: checkModel }), [snapshot]);
}
