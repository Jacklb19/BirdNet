import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { activeModel, downloadModel, MODEL_CACHE } from './modelCache';
import { getSettings, queueStats, updateSettings } from './queueStore';
import { synchronizeQueue } from './syncQueue';
import { SYNC_TAG, type OfflineSettings } from './types';

interface ExtendableEvent extends Event { waitUntil(task: Promise<unknown>): void }
interface MessageEventWithLifetime extends ExtendableEvent { data: { type: string; changes?: Partial<Omit<OfflineSettings, 'session'>>; manifestUrl?: string }; ports: MessagePort[] }
interface SyncEvent extends ExtendableEvent { tag: string }
interface WorkerScope {
  __WB_MANIFEST: { url: string; revision: string | null }[];
  addEventListener(type: 'message', callback: (event: MessageEventWithLifetime) => void): void;
  addEventListener(type: 'sync', callback: (event: SyncEvent) => void): void;
  addEventListener(type: 'activate', callback: (event: ExtendableEvent) => void): void;
  clients: { claim(): Promise<void> };
}
const scope = self as unknown as WorkerScope;
precacheAndRoute((self as unknown as WorkerScope).__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/__birdnet_models\//] }));
registerRoute(({ url }) => url.pathname.startsWith('/__birdnet_models/'), async ({ request }) => (await (await caches.open(MODEL_CACHE)).match(request)) ?? new Response('Model unavailable', { status: 503 }));
scope.addEventListener('activate', (event) => { event.waitUntil(scope.clients.claim()); });
scope.addEventListener('sync', (event) => { if (event.tag === SYNC_TAG) event.waitUntil(synchronizeQueue()); });
let downloading: Promise<unknown> | null = null;
scope.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      let result: unknown;
      switch (event.data.type) {
        case 'MODEL_STATUS': result = await activeModel(); break;
        case 'DOWNLOAD_MODEL': {
          if (downloading) throw new Error('Model download already in progress.');
          const url = event.data.manifestUrl ?? '/models/manifest.json';
          if (!url.startsWith('/') || url.startsWith('//')) throw new Error('Invalid manifest URL.');
          downloading = downloadModel(url, (received, total) => { port.postMessage({ progress: { received, total } }); });
          try { result = await downloading; } finally { downloading = null; }
          break;
        }
        case 'GET_SETTINGS': result = await getSettings(); break;
        case 'UPDATE_SETTINGS': await updateSettings(event.data.changes ?? {}); break;
        case 'QUEUE_STATS': result = await queueStats(); break;
        case 'SYNC': await synchronizeQueue(); break;
        default: throw new Error('Unknown offline operation.');
      }
      port.postMessage({ ok: true, result });
    } catch { port.postMessage({ ok: false }); }
  })());
});
