import { config } from '../../config/env';
import type { AlternateModel } from '../inference/inference.types';
import { alternateBytes, STATIC_MANIFEST_URL, validateManifest } from '../inference/modelManifest';
import type { ModelProgress } from './modelStore';
import { offlineOperation } from './offlineClient';
import { OFFLINE_OPERATIONS } from './offline.constants';

export type AlternateState =
  | 'checking'
  /** The service worker is not in charge (development build): the packaged model loads when listening starts. */
  | 'unmanaged'
  /** Nothing to install: no second model is published, or it could not be asked for and none is on the device. */
  | 'unavailable'
  /** Published and not on the device; `available` tells its size before downloading. */
  | 'absent'
  | 'downloading'
  | 'ready';

export interface AlternateSnapshot {
  readonly state: AlternateState;
  /** The second model verified on this device. */
  readonly installed: AlternateModel | null;
  /** The second model currently published. */
  readonly available: AlternateModel | null;
  readonly progress: ModelProgress;
  /** The last download failed; what was installed before, if anything, is still in use. */
  readonly failed: boolean;
}

const managed = (): boolean => config.offlineEnabled && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** One state per page for the second model (ADR-31), like `modelStore` for the first. */
let snapshot: AlternateSnapshot = { state: 'checking', installed: null, available: null, progress: { received: 0, total: 0 }, failed: false };
const listeners = new Set<() => void>();
let checked = false;
let busy: Promise<void> | null = null;

function update(changes: Partial<AlternateSnapshot>): void {
  snapshot = { ...snapshot, ...changes };
  for (const listener of [...listeners]) listener();
}

export function alternateSnapshot(): AlternateSnapshot {
  return snapshot;
}

/** Whether a choice that needs the second model can take effect now. */
export function alternateUsable(current: AlternateSnapshot): boolean {
  return current.state === 'ready' || (current.state === 'unmanaged' && current.available !== null);
}

async function check(): Promise<void> {
  if (!managed()) {
    // Development: the worker loads whatever the packaged manifest describes, so that is what can be chosen.
    const available = await fetch(STATIC_MANIFEST_URL).then(async (response) => validateManifest(await response.json()).alternate ?? null).catch(() => null);
    update({ state: 'unmanaged', available });
    return;
  }
  const installed = await offlineOperation(OFFLINE_OPERATIONS.alternateStatus).catch(() => null);
  // The published manifest needs the network; without it an installed model is still fully usable.
  const available = await offlineOperation(OFFLINE_OPERATIONS.modelManifest).then((manifest) => manifest.alternate ?? null).catch(() => null);
  if (busy) return;
  update({ installed, available, state: installed ? 'ready' : available ? 'absent' : 'unavailable' });
}

async function download(): Promise<void> {
  const { available, installed } = snapshot;
  update({ state: 'downloading', failed: false, progress: { received: 0, total: available ? alternateBytes(available) : 0 } });
  try {
    const verified = await offlineOperation(OFFLINE_OPERATIONS.downloadAlternate, undefined, (received, total) => { update({ progress: { received, total } }); });
    update({ state: 'ready', installed: verified });
  } catch {
    update({ state: installed ? 'ready' : available ? 'absent' : 'unavailable', failed: true });
  }
}

/** Downloads, verifies and installs the published second model; a call during a download joins it. */
export function downloadAlternate(): Promise<void> {
  if (!managed()) return Promise.resolve();
  busy ??= download().finally(() => { busy = null; });
  return busy;
}

/** Frees the space of the second model; what listens falls back to the first on its own. */
export async function removeAlternate(): Promise<void> {
  if (!managed() || busy) return;
  await offlineOperation(OFFLINE_OPERATIONS.removeAlternate).catch(() => undefined);
  await check();
}

/** The first subscriber starts the single check of this page load. */
export function subscribeAlternate(listener: () => void): () => void {
  listeners.add(listener);
  if (!checked) {
    checked = true;
    void check();
  }
  return () => { listeners.delete(listener); };
}
