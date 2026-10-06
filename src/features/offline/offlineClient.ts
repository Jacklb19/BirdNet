import { SYNC_TAG } from './types';

/** Production-only registration leaves Vite's development module graph untouched. */
export async function registerOffline(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  await navigator.serviceWorker.register('/service-worker.js', { type: 'module' });
}

/** MessageChannel keeps download progress and worker lifetime out of React rendering. */
export async function offlineOperation<T>(type: string, data: object = {}, progress?: (received: number, total: number) => void): Promise<T> {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) throw new Error('Offline worker is not active.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Offline operation timed out.')); }, 300000);
    channel.port1.onmessage = (event: MessageEvent<{ ok?: boolean; result: T; progress?: { received: number; total: number } }>) => {
      if (event.data.progress) { progress?.(event.data.progress.received, event.data.progress.total); return; }
      clearTimeout(timeout); channel.port1.close();
      if (event.data.ok) resolve(event.data.result); else reject(new Error('Offline operation failed.'));
    };
    worker.postMessage({ type, ...data }, [channel.port2]);
  });
}
export async function scheduleSynchronization(): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const registration = await navigator.serviceWorker.ready;
  if ('sync' in registration) await (registration.sync as { register(tag: string): Promise<void> }).register(SYNC_TAG);
  if (navigator.onLine) await offlineOperation('SYNC');
}
