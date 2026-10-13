import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { config } from '../../config/env';
import { STATIC_PAGES } from '../../config/staticPages';
import {
  activeAlternate, alternateFetchPending, downloadAlternate, forgetAlternateFetch, installFetchedAlternate, prepareAlternateFetch, removeAlternate,
  type FetchedRecord,
} from './alternateCache';
import { activeModel, availableManifest, downloadModel, requestedManifestUrl } from './modelCache';
import {
  ALTERNATE_FETCH_ID, APP_SHELL_URL, isOfflineOperation, MODEL_CACHE_NAME, MODEL_CACHE_PATH_PREFIX, OFFLINE_OPERATIONS, SYNC_TAG,
  type OfflineOperation, type OfflineProgress, type OfflineReply, type OfflineRequest, type OfflineRequestMessage, type OfflineResult,
} from './offline.constants';
import { cachedPhoto, cachedSummary, cachedTaxon, isSpeciesPhotoUrl, isSpeciesSummaryUrl, isTaxonUrl } from './photoCache';
import { getSettings, queueStats, updateSettings } from './queueStore';
import { synchronizeQueue } from './syncQueue';

// The app compiles against the DOM library, so the few service worker types used here are declared locally.
interface ExtendableEvent extends Event { waitUntil(task: Promise<unknown>): void }
interface MessageEventWithLifetime extends ExtendableEvent { data: unknown; ports: readonly MessagePort[] }
interface SyncEvent extends ExtendableEvent { tag: string }
/** A background download (Background Fetch) the browser finished, gave up on, or the person cancelled. */
interface BackgroundFetchEvent extends ExtendableEvent { registration: { id: string; matchAll(): Promise<FetchedRecord[]> } }
interface WorkerScope {
  __WB_MANIFEST: { url: string; revision: string | null }[];
  addEventListener(type: 'message', callback: (event: MessageEventWithLifetime) => void): void;
  addEventListener(type: 'sync', callback: (event: SyncEvent) => void): void;
  addEventListener(type: 'install' | 'activate', callback: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'backgroundfetchsuccess' | 'backgroundfetchfail' | 'backgroundfetchabort', callback: (event: BackgroundFetchEvent) => void): void;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
}
const scope = self as unknown as WorkerScope;
const SERVICE_UNAVAILABLE = 503;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Matches a same-origin path prefix and everything below it. */
function pathPrefixPattern(prefix: string): RegExp {
  return new RegExp(`^${escapeRegExp(prefix.replace(/\/+$/, ''))}(?:/|$)`);
}
/** An absolute API base lives on another origin and never reaches the navigation route. */
const apiPathPrefix = config.apiBaseUrl.startsWith('/') && config.apiBaseUrl !== '/' ? [config.apiBaseUrl] : [];
/** Paths that must reach the network (API, static pages such as the privacy policy) or the model route instead of the app shell. */
const NAVIGATION_DENYLIST = [...apiPathPrefix, MODEL_CACHE_PATH_PREFIX, ...STATIC_PAGES].map(pathPrefixPattern);

// workbox-build injects the precache list only where the literal `self.__WB_MANIFEST` appears in the bundle.
precacheAndRoute((self as unknown as WorkerScope).__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL(APP_SHELL_URL), { denylist: NAVIGATION_DENYLIST }));
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(MODEL_CACHE_PATH_PREFIX),
  async ({ request }) => (await (await caches.open(MODEL_CACHE_NAME)).match(request)) ?? new Response('Model unavailable', { status: SERVICE_UNAVAILABLE }),
);
registerRoute(
  ({ url }) => isSpeciesPhotoUrl(url),
  ({ request, event }: { request: Request; event: ExtendableEvent }) => cachedPhoto(request, (task) => { event.waitUntil(task); }),
);
registerRoute(
  ({ url }) => isSpeciesSummaryUrl(url),
  ({ request, event }: { request: Request; event: ExtendableEvent }) => cachedSummary(request, (task) => { event.waitUntil(task); }),
);
registerRoute(
  ({ url }) => isTaxonUrl(url),
  ({ request, event }: { request: Request; event: ExtendableEvent }) => cachedTaxon(request, (task) => { event.waitUntil(task); }),
);
// A new version does not wait for every tab of the previous one to be closed, which may never happen: it takes
// over as soon as the browser lets it, so the next reload or visit is the new version. A page that is open
// keeps running its own code and offers the reload (`appUpdate.ts`). The operations of both versions are the
// same or a superset, so such a page goes on working meanwhile.
scope.addEventListener('install', (event) => { event.waitUntil(scope.skipWaiting()); });
scope.addEventListener('activate', (event) => { event.waitUntil(scope.clients.claim()); });

let synchronization: Promise<void> | null = null;
async function synchronizeOnce(): Promise<undefined> {
  synchronization ??= synchronizeQueue();
  try { await synchronization; } finally { synchronization = null; }
  return undefined;
}
scope.addEventListener('sync', (event) => { if (event.tag === SYNC_TAG) event.waitUntil(synchronizeOnce()); });

type Report = (update: OfflineProgress) => void;
let downloading: { readonly what: string; readonly task: Promise<unknown>; readonly watchers: Set<Report> } | null = null;
/**
 * One model download at a time: two would compete for the connection and for memory. A page that asks for the
 * one already running joins it, which is what happens when it took a quiet download for stopped and asked again.
 */
async function exclusively<Result>(what: string, report: Report, start: (progress: (received: number, total: number) => void) => Promise<Result>): Promise<Result> {
  if (downloading) {
    if (downloading.what !== what) throw new Error('Another model download is in progress.');
    downloading.watchers.add(report);
    return downloading.task as Promise<Result>;
  }
  const watchers = new Set([report]);
  const task = start((received, total) => { for (const watcher of watchers) watcher({ received, total }); });
  downloading = { what, task, watchers };
  try { return await task; } finally { downloading = null; }
}
function download(manifestUrl: string | undefined, progress: Report): Promise<OfflineResult<typeof OFFLINE_OPERATIONS.downloadModel>> {
  const url = requestedManifestUrl(manifestUrl);
  return exclusively(`${OFFLINE_OPERATIONS.downloadModel} ${url}`, progress, (report) => downloadModel(url, report));
}

// The second model may also arrive through a background download the page started (`alternateFetch.ts`): the
// browser wakes this worker when it ends, with or without the app open. Either way the note of what was asked
// for is gone afterwards, which is how an open page knows this worker is done (`alternateFetchPending`).
async function settleAlternateFetch(event: BackgroundFetchEvent, install: boolean): Promise<void> {
  try {
    if (install) await installFetchedAlternate(await event.registration.matchAll());
    else await forgetAlternateFetch();
  } catch { /* Nothing was installed; the person can ask for the model again. */ }
}
scope.addEventListener('backgroundfetchsuccess', (event) => { if (event.registration.id === ALTERNATE_FETCH_ID) event.waitUntil(settleAlternateFetch(event, true)); });
scope.addEventListener('backgroundfetchfail', (event) => { if (event.registration.id === ALTERNATE_FETCH_ID) event.waitUntil(settleAlternateFetch(event, false)); });
scope.addEventListener('backgroundfetchabort', (event) => { if (event.registration.id === ALTERNATE_FETCH_ID) event.waitUntil(settleAlternateFetch(event, false)); });

type OfflineHandlers = {
  readonly [O in OfflineOperation]: (request: OfflineRequest<O>, progress: (update: OfflineProgress) => void) => Promise<OfflineResult<O>>;
};
/** One handler per operation; the mapped type makes a missing or mistyped handler a compile error. */
const handlers: OfflineHandlers = {
  [OFFLINE_OPERATIONS.modelStatus]: () => activeModel(),
  [OFFLINE_OPERATIONS.modelManifest]: async () => (await availableManifest()).manifest,
  [OFFLINE_OPERATIONS.downloadModel]: (request, progress) => download(request?.manifestUrl, progress),
  [OFFLINE_OPERATIONS.alternateStatus]: () => activeAlternate(),
  [OFFLINE_OPERATIONS.downloadAlternate]: (_request, progress) => exclusively(OFFLINE_OPERATIONS.downloadAlternate, progress, (report) => downloadAlternate(report)),
  [OFFLINE_OPERATIONS.prepareAlternateFetch]: () => prepareAlternateFetch(),
  [OFFLINE_OPERATIONS.forgetAlternateFetch]: async () => { await forgetAlternateFetch(); return undefined; },
  [OFFLINE_OPERATIONS.alternateFetchPending]: () => alternateFetchPending(),
  [OFFLINE_OPERATIONS.removeAlternate]: async () => { await removeAlternate(); return undefined; },
  [OFFLINE_OPERATIONS.getSettings]: () => getSettings(),
  [OFFLINE_OPERATIONS.updateSettings]: async (request) => { await updateSettings(request.changes); return undefined; },
  [OFFLINE_OPERATIONS.queueStats]: () => queueStats(),
  [OFFLINE_OPERATIONS.sync]: () => synchronizeOnce(),
};

/**
 * Messages come from same-origin pages, but are still checked: the operation name here, the payload by its
 * handler (`updateSettings` and `requestedManifestUrl` reject anything malformed, which replies `ok: false`).
 */
function parseRequest(data: unknown): OfflineRequestMessage {
  if (!data || typeof data !== 'object' || !('type' in data) || !isOfflineOperation(data.type)) throw new Error('Unknown offline operation.');
  return data as OfflineRequestMessage;
}
function perform<O extends OfflineOperation>(operation: O, request: OfflineRequest<O>, port: MessagePort): Promise<OfflineResult<O>> {
  const handler: OfflineHandlers[O] = handlers[operation];
  return handler(request, (progress) => { port.postMessage({ progress } satisfies OfflineReply); });
}
async function reply(data: unknown, port: MessagePort): Promise<void> {
  try {
    const message = parseRequest(data);
    const result = await perform(message.type, message.request, port);
    port.postMessage({ ok: true, result } satisfies OfflineReply);
  } catch { port.postMessage({ ok: false } satisfies OfflineReply); }
}
scope.addEventListener('message', (event) => {
  const port = event.ports[0];
  if (port) event.waitUntil(reply(event.data, port));
});
