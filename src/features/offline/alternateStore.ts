import { config } from '../../config/env';
import type { AlternateModel } from '../inference/inference.types';
import { alternateBytes, STATIC_MANIFEST_URL, validateManifest } from '../inference/modelManifest';
import { followAlternateFetch, runningAlternateFetch, startAlternateFetch, type BackgroundDownload } from './alternateFetch';
import { untilComplete } from './downloadAttempts';
import type { ModelProgress } from './modelStore';
import { offlineOperation } from './offlineClient';
import { BACKGROUND_INSTALL_POLL_MS, BACKGROUND_INSTALL_TIMEOUT_MS, OFFLINE_OPERATIONS } from './offline.constants';

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
  /** The download in course is the one the browser makes by itself (`alternateFetch.ts`): it goes on with the app closed. */
  readonly background: boolean;
  /** The last download failed; what was installed before, if anything, is still in use. */
  readonly failed: boolean;
}

const managed = (): boolean => config.offlineEnabled && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** One state per page for the second model (ADR-31), like `modelStore` for the first. */
let snapshot: AlternateSnapshot = { state: 'checking', installed: null, available: null, progress: { received: 0, total: 0 }, background: false, failed: false };
const listeners = new Set<() => void>();
let checked = false;
let busy: Promise<void> | null = null;
/** Read after every wait: a download may have started meanwhile. */
const downloading = (): boolean => busy !== null;
/** The browser did not take, or did not finish, a background download: the next ones of this visit run in the app. */
let backgroundUnreliable = false;

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
  if (downloading()) return;
  update({ installed, available, state: installed ? 'ready' : available ? 'absent' : 'unavailable' });
  // A background download started on an earlier visit still runs in the browser: this page takes up following it.
  const running = await runningAlternateFetch();
  if (running && !downloading()) busy = follow(running).then(() => undefined).finally(() => { busy = null; });
}

const report = (received: number, total: number): void => { update({ progress: { received, total } }); };

/**
 * Follows a background download to its end. The browser only says the files arrived; the service worker then
 * verifies and installs them and announces it, and only what it installed counts. False when the browser never
 * began the download, which is then still to be made.
 */
async function follow(download: BackgroundDownload): Promise<boolean> {
  update({ state: 'downloading', background: true, failed: false, progress: { received: download.downloaded, total: download.downloadTotal } });
  const outcome = await followAlternateFetch(download, report);
  if (outcome === 'success') await installationSettled();
  const { available } = snapshot;
  const installed = await offlineOperation(OFFLINE_OPERATIONS.alternateStatus).catch(() => snapshot.installed);
  const arrived = outcome === 'success' && installed !== null && (!available || installed.sha256 === available.sha256);
  const failed = outcome !== 'cancelled' && outcome !== 'unstarted' && !arrived;
  if (failed || outcome === 'unstarted') backgroundUnreliable = true;
  update({ background: false, installed, state: installed ? 'ready' : available ? 'absent' : 'unavailable', failed });
  return outcome !== 'unstarted';
}

/** Waits until the service worker has installed or discarded the files the browser downloaded. */
async function installationSettled(): Promise<void> {
  const deadline = Date.now() + BACKGROUND_INSTALL_TIMEOUT_MS;
  while (Date.now() < deadline && await offlineOperation(OFFLINE_OPERATIONS.alternateFetchPending).catch(() => false)) {
    await new Promise((resolve) => { setTimeout(resolve, BACKGROUND_INSTALL_POLL_MS); });
  }
}

async function download(title: string): Promise<void> {
  const { available, installed } = snapshot;
  update({ state: 'downloading', background: false, failed: false, progress: { received: 0, total: available ? alternateBytes(available) : 0 } });
  try {
    const handed = backgroundUnreliable ? null : await startAlternateFetch(title);
    if (handed && await follow(handed)) return;
    backgroundUnreliable = true;
    update({ state: 'downloading', background: false });
    const verified = await untilComplete((progress) => offlineOperation(OFFLINE_OPERATIONS.downloadAlternate, undefined, progress), report);
    update({ state: 'ready', installed: verified });
  } catch {
    update({ state: installed ? 'ready' : available ? 'absent' : 'unavailable', background: false, failed: true });
  }
}

/**
 * Downloads, verifies and installs the published second model; a call during a download joins it. `title` names
 * the download where the browser shows it among those of the system.
 */
export function downloadAlternate(title: string): Promise<void> {
  if (!managed()) return Promise.resolve();
  busy ??= download(title).finally(() => { busy = null; });
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
