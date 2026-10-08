import { config } from '../../config/env';
import type { ModelManifest } from '../inference/inference.types';
import { downloadBytes, sameInstallation } from '../inference/modelManifest';
import { offlineOperation } from './offlineClient';
import { OFFLINE_OPERATIONS } from './offline.constants';

export type ModelState =
  /** The service worker is not in charge (development build): the model loads when listening starts. */
  | 'unmanaged'
  | 'checking'
  /** No verified model on the device yet; `available` tells its size before downloading. */
  | 'missing'
  | 'downloading'
  /** A verified model is installed; it stays usable even when a later check or update download fails. */
  | 'ready'
  /** No usable model is known on the device and the last check or download failed. */
  | 'error';

/**
 * Outcome of the last comparison with the published model that the person asked for (`checkModel`). The check
 * made when the app starts is not reported here, so nothing is claimed before the person asks.
 */
export type UpdateCheck = 'idle' | 'checking' | 'current' | 'available' | 'failed';

export interface ModelProgress { readonly received: number; readonly total: number }

export interface ModelSnapshot {
  readonly state: ModelState;
  /** Model verified and installed on this device. */
  readonly installed: ModelManifest | null;
  /** Model currently published; differs from `installed` when an update exists. */
  readonly available: ModelManifest | null;
  readonly progress: ModelProgress;
  /** The browser refused persistent storage, so it may evict the model under pressure. */
  readonly evictable: boolean;
  readonly updateCheck: UpdateCheck;
  /** The last download of a newer version failed; the installed model is still in use ('ready'). */
  readonly updateFailed: boolean;
}

const managed = (): boolean => config.offlineEnabled && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/**
 * One state per page, shared by every screen (Welcome, Listen, Settings): a download started on one screen is
 * seen, with its progress, on the others, and none of them starts a second one.
 */
let snapshot: ModelSnapshot = {
  state: managed() ? 'checking' : 'unmanaged',
  installed: null,
  available: null,
  progress: { received: 0, total: 0 },
  evictable: false,
  updateCheck: 'idle',
  updateFailed: false,
};
const listeners = new Set<() => void>();
let initialCheckStarted = false;
/** Set once the person entered the app: from then on the model installs and updates itself (ADR-19). */
let automatic = false;
let downloading: Promise<void> | null = null;
/** Counts downloads started, so a check that began before one never overwrites what the download installed. */
let downloadsStarted = 0;

function update(changes: Partial<ModelSnapshot>): void {
  snapshot = { ...snapshot, ...changes };
  for (const listener of [...listeners]) listener();
}

export function modelSnapshot(): ModelSnapshot {
  return snapshot;
}

/** Compares the installed model with the published one; `explicit` reports the outcome in `updateCheck`. */
async function check(explicit: boolean): Promise<void> {
  const generation = downloadsStarted;
  const settle = (found: Pick<ModelSnapshot, 'installed' | 'available' | 'state'> | null, outcome: UpdateCheck): void => {
    const current = !downloading && generation === downloadsStarted;
    update({ ...(current && found ? found : {}), ...(explicit ? { updateCheck: outcome } : {}) });
  };
  if (explicit) update({ updateCheck: 'checking' });
  // After a failure without any model the check shows progress again; a usable model stays 'ready' meanwhile.
  if (snapshot.state === 'error') update({ state: 'checking' });
  let installed: ModelManifest | null;
  try {
    installed = await offlineOperation(OFFLINE_OPERATIONS.modelStatus);
  } catch {
    // The service worker did not answer: a model known to be installed is still on the device.
    const { installed: known, available } = snapshot;
    settle({ installed: known, available, state: known ? 'ready' : 'error' }, 'failed');
    return;
  }
  // The published manifest needs the network; without it the installed model is still fully usable.
  const published = await offlineOperation(OFFLINE_OPERATIONS.modelManifest).catch(() => null);
  if (!published) {
    const available = snapshot.available ?? installed;
    settle({ installed, available, state: installed ? 'ready' : available ? 'missing' : 'error' }, 'failed');
    return;
  }
  // A different content hash is a different model, whatever its name says.
  const newer = !installed || !sameInstallation(published, installed);
  settle({ installed, available: published, state: installed ? 'ready' : 'missing' }, newer ? 'available' : 'current');
  // A new version replaces the installed one in the background; the installed model keeps working meanwhile.
  if (automatic && newer) void downloadModel();
}

/**
 * Called when the person has entered the app: a missing model downloads now (the one download the app needs) and
 * any later version is fetched in the background, so nobody is asked to download again.
 */
export function enableAutomaticModel(): void {
  if (automatic || !managed()) return;
  automatic = true;
  if (snapshot.state === 'missing' || snapshot.state === 'error') void downloadModel();
}

/**
 * Asks the service worker again for the installed model and the published one, and reports whether a newer one
 * exists, none does, or the comparison could not be made. Resolves once the outcome is in the snapshot.
 */
export function checkModel(): Promise<void> {
  return managed() ? check(true) : Promise.resolve();
}

async function download(): Promise<void> {
  downloadsStarted += 1;
  update({ state: 'downloading', updateFailed: false, progress: { received: 0, total: snapshot.available ? downloadBytes(snapshot.available) : 0 } });
  try {
    // Ask before the large download, so the browser can keep the model instead of evicting it.
    if ('persist' in navigator.storage) update({ evictable: !await navigator.storage.persist() });
    const verified = await offlineOperation(OFFLINE_OPERATIONS.downloadModel, {}, (received, total) => { update({ progress: { received, total } }); });
    update({ state: 'ready', installed: verified, available: verified, updateCheck: 'idle' });
  } catch {
    // A failed update keeps the installed model in use; only a first download leaves nothing usable.
    update(snapshot.installed ? { state: 'ready', updateFailed: true } : { state: 'error' });
  }
}

/** Downloads, verifies and activates the published model; a call during a download joins it. */
export function downloadModel(): Promise<void> {
  if (!managed()) return Promise.resolve();
  downloading ??= download().finally(() => { downloading = null; });
  return downloading;
}

/** The first subscriber starts the single initial check of this page load. */
export function subscribeModel(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialCheckStarted && managed()) {
    initialCheckStarted = true;
    void check(false);
  }
  return () => { listeners.delete(listener); };
}
