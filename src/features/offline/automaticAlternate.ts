import { useEffect, useSyncExternalStore } from 'react';
import { modelInUse, needsSecondModel } from '../inference/detectionChoices';
import { alternateBytes } from '../inference/modelManifest';
import { alternateSnapshot, downloadAlternate, subscribeAlternate } from './alternateStore';
import { modelSnapshot, subscribeModel } from './modelStore';
import type { OfflineSettings } from './types';
import { useOfflineSettings } from './useOfflineSettings';

/**
 * The second model downloads by itself, in the background, once the first one is installed (ADR-36): by default both
 * listen together. It never starts where the browser says the person saves data or is on a mobile network, nor
 * without room for it; elsewhere (iPhone, Firefox: no network type known) it starts like the first model did.
 * Ajustes shows it and lets the person remove it.
 */

/** The parts of the Network Information API the decision reads; only Chromium browsers have it. */
export interface ConnectionHints {
  readonly saveData?: boolean;
  readonly type?: string;
  readonly effectiveType?: string;
}

const SLOW_CONNECTIONS: readonly string[] = ['slow-2g', '2g'];
/**
 * A resumable download keeps its parts in the cache until the whole file is checked, so it briefly takes the size
 * of the model twice (ADR-34).
 */
const SPACE_FACTOR = 2;

export function connectionAllows(connection: ConnectionHints | undefined): boolean {
  if (!connection) return true;
  if (connection.saveData === true || connection.type === 'cellular') return false;
  return !SLOW_CONNECTIONS.includes(connection.effectiveType ?? '');
}

/** Whether what listens for this person, once the second model is there, would use it. */
export function wantsSecondModel(settings: Pick<OfflineSettings, 'detectionModel' | 'tooSlowForTwo'>): boolean {
  return needsSecondModel(modelInUse(settings.detectionModel, true, settings.tooSlowForTwo));
}

export async function hasRoomFor(bytes: number, storage: Pick<StorageManager, 'estimate'> | undefined): Promise<boolean> {
  if (!storage) return true;
  try {
    const { quota, usage } = await storage.estimate();
    return quota === undefined || usage === undefined || quota - usage >= bytes * SPACE_FACTOR;
  } catch {
    return true;
  }
}

function connection(): ConnectionHints | undefined {
  return (navigator as Navigator & { readonly connection?: ConnectionHints }).connection;
}

/** Tried once per visit to the app: a failed download is not retried behind the person's back. */
let attempted = false;

/** Mounted once, in the shell, after the person entered the app (the same moment the first model installs itself). */
export function useAutomaticAlternate(enabled: boolean, title: string): void {
  const model = useSyncExternalStore(subscribeModel, modelSnapshot);
  const second = useSyncExternalStore(subscribeAlternate, alternateSnapshot);
  const { settings } = useOfflineSettings();
  const due = enabled && !attempted && model.state === 'ready' && second.state === 'absent' && second.available !== null &&
    settings !== null && wantsSecondModel(settings) && navigator.onLine && connectionAllows(connection());
  const bytes = second.available ? alternateBytes(second.available) : 0;
  useEffect(() => {
    if (!due) return;
    attempted = true;
    void hasRoomFor(bytes, navigator.storage).then((room) => { if (room) void downloadAlternate(title); });
  }, [due, bytes, title]);
}
