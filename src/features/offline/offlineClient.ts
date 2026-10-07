import { config } from '../../config/env';
import {
  dispatchSyncError, OFFLINE_OPERATION_TIMEOUT_MS, OFFLINE_OPERATIONS, SERVICE_WORKER_URL, SYNC_RETRY_INTERVAL_MS, SYNC_TAG,
  type OfflineOperation, type OfflineReply, type OfflineRequest, type OfflineResult,
} from './offline.constants';

/** Registration follows `config.offlineEnabled`, so development keeps Vite's module graph untouched. */
export async function registerOffline(): Promise<void> {
  if (!config.offlineEnabled || !('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { type: 'module' });
  const retry = (): void => { void scheduleSynchronization().catch(dispatchSyncError); };
  window.addEventListener('online', retry);
  setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) retry(); }, SYNC_RETRY_INTERVAL_MS);
  await navigator.serviceWorker.ready;
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
 */
export async function offlineOperation<O extends OfflineOperation>(operation: O, ...[request, progress]: OfflineOperationArguments<O>): Promise<OfflineResult<O>> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error('Offline worker is not active.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Offline operation timed out.')); }, OFFLINE_OPERATION_TIMEOUT_MS);
    channel.port1.onmessage = (event: MessageEvent<OfflineReply<O>>) => {
      const message = event.data;
      if ('progress' in message) { progress?.(message.progress.received, message.progress.total); return; }
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
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) await (registration.sync as { register(tag: string): Promise<void> }).register(SYNC_TAG);
    if (navigator.onLine) await offlineOperation(OFFLINE_OPERATIONS.sync);
  })();
  try { await synchronization; } finally { synchronization = null; }
}
