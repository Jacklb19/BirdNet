import { config } from '../../config/env';
import { watchForUpdates } from './appUpdate';
import {
  dispatchSyncError, DOWNLOAD_STALL_TIMEOUT_MS, OFFLINE_OPERATION_TIMEOUT_MS, OFFLINE_OPERATIONS, SERVICE_WORKER_READY_TIMEOUT_MS, SERVICE_WORKER_URL,
  SYNC_RETRY_INTERVAL_MS, SYNC_TAG, type OfflineOperation, type OfflineReply, type OfflineRequest, type OfflineResult,
} from './offline.constants';

/**
 * The registration in progress, or null once it failed: the next operation registers again, so "try again" on the
 * screen that reported the failure also retries the service worker (audit F01).
 */
let registration: Promise<ServiceWorkerRegistration> | null = null;

function register(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register(SERVICE_WORKER_URL, { type: 'module' }).then((registered) => {
    watchForUpdates(registered);
    return registered;
  }).catch((error: unknown) => {
    registration = null;
    throw error;
  });
  return registration;
}

/**
 * The active service worker. `navigator.serviceWorker.ready` never settles when the registration failed, so the wait
 * is bounded, and a failed registration is retried first.
 */
async function activeWorker(): Promise<ServiceWorker> {
  if (config.offlineEnabled) await register();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error('The offline worker did not start.')); }, SERVICE_WORKER_READY_TIMEOUT_MS);
  });
  try {
    const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
    if (!ready.active) throw new Error('Offline worker is not active.');
    return ready.active;
  } finally {
    clearTimeout(timer);
  }
}

/** Registration follows `config.offlineEnabled`, so development keeps Vite's module graph untouched. */
export async function registerOffline(): Promise<void> {
  if (!config.offlineEnabled || !('serviceWorker' in navigator)) return;
  const retry = (): void => { void scheduleSynchronization().catch(dispatchSyncError); };
  window.addEventListener('online', retry);
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) retry(); }, SYNC_RETRY_INTERVAL_MS);
  await activeWorker();
  await scheduleSynchronization();
}

export type OfflineProgressCallback = (received: number, total: number) => void;

/** The payload may be omitted only for operations that do not need one. */
export type OfflineOperationArguments<O extends OfflineOperation> = undefined extends OfflineRequest<O>
  ? [request?: OfflineRequest<O>, progress?: OfflineProgressCallback]
  : [request: OfflineRequest<O>, progress?: OfflineProgressCallback];

/**
 * Runs `operation` in the service worker and resolves with its typed result. A MessageChannel keeps download
 * progress and the worker's lifetime out of React rendering.
 *
 * The browser may stop the worker in the middle of an operation, and then no answer ever comes. An operation
 * followed with `progress` is given up after a short silence, counted from its last report, so a stopped download
 * is noticed soon and can be asked for again; the others are given the long wait.
 */
export async function offlineOperation<O extends OfflineOperation>(operation: O, ...[request, progress]: OfflineOperationArguments<O>): Promise<OfflineResult<O>> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
  const worker = await activeWorker();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const patience = progress ? DOWNLOAD_STALL_TIMEOUT_MS : OFFLINE_OPERATION_TIMEOUT_MS;
    const giveUp = (): void => { channel.port1.close(); reject(new Error('Offline operation timed out.')); };
    let timeout = setTimeout(giveUp, patience);
    channel.port1.onmessage = (event: MessageEvent<OfflineReply<O>>) => {
      const message = event.data;
      if ('progress' in message) {
        clearTimeout(timeout);
        timeout = setTimeout(giveUp, patience);
        progress?.(message.progress.received, message.progress.total);
        return;
      }
      clearTimeout(timeout); channel.port1.close();
      if (message.ok) resolve(message.result); else reject(new Error('Offline operation failed.'));
    };
    // Shape of `OfflineRequestMessage<O>`; the signature above already guarantees the payload type.
    worker.postMessage({ type: operation, request }, [channel.port2]);
  });
}

let synchronization: Promise<void> | null = null;
export async function scheduleSynchronization(): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  if (synchronization) return synchronization;
  synchronization = (async () => {
    const ready = await navigator.serviceWorker.ready;
    if ('sync' in ready) await (ready.sync as { register(tag: string): Promise<void> }).register(SYNC_TAG);
    if (navigator.onLine) await offlineOperation(OFFLINE_OPERATIONS.sync);
  })();
  try { await synchronization; } finally { synchronization = null; }
}
