/**
 * Names and limits of the offline layer (IndexedDB queue, service worker protocol, background sync).
 * Shared by the page and the service worker, so neither side retypes a string the other depends on.
 */
import type { DetectionStatus } from '../../config/contract';
import type { LocalDetectionStatus } from '../inference/detectionPolicy';
import type { AlternateModel, ModelManifest } from '../inference/inference.types';
import type { OfflineSettings, QueueStats } from './types';

// ─── Local queue (IndexedDB) ─────────────────────────────────────────────

export const DATABASE_NAME = 'birdnet-offline-v1';

/**
 * API status stored and sent for each local verification state (Table 7). Typed against both unions, so a new
 * local state cannot reach the queue without an explicit API status.
 */
export const QUEUED_STATUS_BY_LOCAL_STATUS = Object.freeze({
  provisional: 'provisional',
  confirmed_local: 'confirmed',
} as const satisfies Readonly<Record<LocalDetectionStatus, DetectionStatus>>);

export type QueuedDetectionStatus = (typeof QUEUED_STATUS_BY_LOCAL_STATUS)[LocalDetectionStatus];

/** Bump with every change to `STORES` or their key paths; the upgrade only creates missing stores. */
export const DATABASE_VERSION = 2;

/** Object stores of the queue database. */
export const STORES = Object.freeze({
  /** Pending detections, keyed by their client UUID (the idempotency key of synchronization). */
  detections: 'detections',
  /**
   * Leftover, never written: it held the doubtful fragments earlier versions uploaded for verification. Dropping a
   * store needs a new `DATABASE_VERSION`, which a service worker of the previous release could not open during an
   * update, so the store stays and `queueStore` empties it.
   */
  audio: 'audio',
  /** One record (`SETTINGS_RECORD_KEY`) with the person's offline preferences. */
  settings: 'settings',
  /** Detections the server has acknowledged, kept so the local log survives synchronization. */
  history: 'history',
} as const);

export type StoreName = (typeof STORES)[keyof typeof STORES];

/**
 * How near a saved place a song must be heard to be filed under it when no place was chosen by hand (ADR-25):
 * about the size of a park, so a walk through it counts for it and the next neighbourhood does not.
 */
export const PLACE_RADIUS_METERS = 300;

/** Key of the single record in `STORES.settings`. */
export const SETTINGS_RECORD_KEY = 'preferences';

/** Preferences the interface may change; the session and cached sites are written by dedicated functions. */
export const EDITABLE_SETTINGS_KEYS = Object.freeze(
  ['maxBytes', 'locationEnabled', 'activeSiteId', 'shareMap', 'keepRecordings', 'saveRecordings', 'detectionModel', 'detectionStyle'] as const satisfies readonly (keyof OfflineSettings)[],
);

export type EditableSettingsKey = (typeof EDITABLE_SETTINGS_KEYS)[number];
export type EditableSettings = Partial<Pick<OfflineSettings, EditableSettingsKey>>;

export function isEditableSettingsKey(key: string): key is EditableSettingsKey {
  return (EDITABLE_SETTINGS_KEYS as readonly string[]).includes(key);
}

/** Binary mebibyte: queue limits are shown and chosen in whole MiB. */
export const BYTES_PER_MIB = 1024 * 1024;

export function mibToBytes(mib: number): number {
  return mib * BYTES_PER_MIB;
}

export function bytesToMib(bytes: number): number {
  return bytes / BYTES_PER_MIB;
}

/** Queue capacity until the person chooses another one. */
export const DEFAULT_QUEUE_BYTES = mibToBytes(64);

/** Smallest capacity accepted; it still holds a few thousand songs waiting to upload. */
export const MIN_QUEUE_BYTES = mibToBytes(1);

// ─── Synchronization ─────────────────────────────────────────────────────

/** Background Sync registration tag. */
export const SYNC_TAG = 'birdnet-detections';

/** Web Lock that serializes foreground retries with Background Sync, in the page and in the service worker. */
export const SYNC_LOCK_NAME = 'birdnet-sync';

/** Foreground retry period while the page is visible and online (browsers without Background Sync). */
export const SYNC_RETRY_INTERVAL_MS = 30_000;

/** Dispatched on `window` when a background synchronization attempt fails; the UI shows a retry notice. */
export const SYNC_ERROR_EVENT = 'birdnet-sync-error';

export function dispatchSyncError(): void {
  window.dispatchEvent(new Event(SYNC_ERROR_EVENT));
}

/** Only origins served over this protocol may receive uploads or provide cached resources. */
export const SECURE_PROTOCOL = 'https:';

/** Media type of API request bodies and of a manifest published by the API. */
export const JSON_MIME_TYPE = 'application/json';
export const JSON_HEADERS = Object.freeze({ 'Content-Type': JSON_MIME_TYPE });

/**
 * BroadcastChannel on which every context that writes the queue database (pages, the inference worker and the
 * service worker) announces each committed change, so open views re-read what changed instead of polling.
 */
export const QUEUE_CHANGED_CHANNEL = 'birdnet-queue-changed';

/**
 * What a committed write changed: the queued and synchronized records, the stored settings (preferences,
 * sync session, cached sites), the walks, the recordings or the reviews (each kept in its own database, announced
 * on the same channel). Views re-read only the part they show.
 */
export const QUEUE_CHANGE_PARTS = Object.freeze(['records', 'settings', 'walks', 'recordings', 'reviews'] as const);

export type QueueChangePart = (typeof QUEUE_CHANGE_PARTS)[number];

/**
 * Where BroadcastChannel is missing, changes made by the workers are only found by re-reading at this period
 * (changes made by the page itself are still seen at once).
 */
export const QUEUE_CHANGE_POLL_MS = 5_000;

// ─── Service worker and caches ───────────────────────────────────────────

/**
 * Public URL of the service worker: `SW_FILENAME` of `build.config.mjs` at the site root, served with
 * `Cache-Control: no-cache` by `vercel.json` (both checked by `src/config/config.test.ts`).
 */
export const SERVICE_WORKER_URL = '/service-worker.js';

/** Precached document served for every in-app navigation: `APP_SHELL_HTML` of `build.config.mjs` (checked by `config.test.ts`). */
export const APP_SHELL_URL = '/index.html';

/** Verified model files. Renaming it orphans the models people already downloaded. */
export const MODEL_CACHE_NAME = 'birdnet-models-v1';

/** Same-origin path under which the service worker serves the verified model from `MODEL_CACHE_NAME`. */
export const MODEL_CACHE_PATH_PREFIX = '/__birdnet_models/';

/** Pointer to the verified installation in `MODEL_CACHE_NAME`; written last so a partial download is never activated. */
export const ACTIVE_MODEL_URL = `${MODEL_CACHE_PATH_PREFIX}active.json`;

/** Pointer to the verified installation of the second model (ADR-31), written last like `ACTIVE_MODEL_URL`. */
export const ALTERNATE_MODEL_URL = `${MODEL_CACHE_PATH_PREFIX}alternate.json`;

/**
 * Bytes of a model resource asked for per request while downloading (`verifiedDownload.ts`). Small enough that
 * an interruption loses seconds of a mobile connection, large enough that a model takes a few dozen requests.
 */
export const DOWNLOAD_PIECE_BYTES = 4 * 1024 * 1024;

/**
 * What a background download of the second model was started for (`alternateCache.ts`), kept until the browser
 * hands the files over, so they are checked against what was asked for.
 */
export const ALTERNATE_PENDING_URL = `${MODEL_CACHE_PATH_PREFIX}alternate-pending.json`;

/** Name of the one background download (Background Fetch) the app starts: the second model. */
export const ALTERNATE_FETCH_ID = 'birdnet-alternate-model';

/** What the page hands to the browser to download in the background: the files of the second model and their size. */
export interface AlternateFetchPlan {
  readonly urls: readonly string[];
  readonly total: number;
}

/** File extension of each verified resource cached under `MODEL_CACHE_PATH_PREFIX`, named by its content hash. */
export const MODEL_RESOURCE_EXTENSIONS = Object.freeze({ model: 'onnx', labels: 'txt', geo: 'geo.onnx' } as const);

export type ModelResourceKind = keyof typeof MODEL_RESOURCE_EXTENSIONS;

/** Species photos from the configured image hosts, kept for offline viewing. */
export const PHOTO_CACHE_NAME = 'birdnet-photos-v1';

/**
 * Oldest photos are evicted beyond this count. It leaves room for the optional regional guide (`GUIDE_MAX_SPECIES`)
 * plus the birds seen elsewhere; at `THUMBNAIL_WIDTH_PX` (species/speciesPhotos.ts) that is a few tens of MB at most.
 */
export const PHOTO_CACHE_MAX_ENTRIES = 400;

/** Species summaries (Wikipedia) kept for offline reading of the cards. */
export const SUMMARY_CACHE_NAME = 'birdnet-summaries-v1';

/** A summary is a few kB, so the cache can hold the regional guide in both languages and every bird seen. */
export const SUMMARY_CACHE_MAX_ENTRIES = 800;

/** Taxonomy and conservation status of the species (GBIF API) kept for offline reading of the cards. */
export const TAXON_CACHE_NAME = 'birdnet-taxa-v1';

/** Two small answers per species (name match and Red List category); the same number of cards as the summaries in one language. */
export const TAXON_CACHE_MAX_ENTRIES = 800;

// ─── Page ↔ service worker protocol ──────────────────────────────────────

/** How often an app left open asks whether a new version exists, when the person comes back to it (one hour). */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Longest wait for one operation without progress to report (five minutes). */
export const OFFLINE_OPERATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Longest silence of a download before the page takes it for stopped. A download reports every network chunk, so
 * a minute without news means the worker was suspended or stopped by the browser (which it does to any worker
 * busy for long, and when the person leaves the app); the page then asks again and the download goes on from the
 * pieces already kept (`downloadAttempts.ts`).
 */
export const DOWNLOAD_STALL_TIMEOUT_MS = 60 * 1000;

/** Longest wait for the browser to accept a background download before downloading inside the app instead. */
export const BACKGROUND_FETCH_START_TIMEOUT_MS = 10 * 1000;

/**
 * Longest wait for the first bytes of a background download. A browser may accept one and never begin it (one
 * without a place to show downloads does); past this the download is cancelled and made inside the app.
 */
export const BACKGROUND_FETCH_FIRST_BYTES_TIMEOUT_MS = 20 * 1000;

/**
 * Once the browser has finished a background download, the service worker verifies and installs it. The page asks
 * at this period whether it is done, and stops asking after the longest wait.
 */
export const BACKGROUND_INSTALL_POLL_MS = 1000;
export const BACKGROUND_INSTALL_TIMEOUT_MS = 2 * 60 * 1000;

/** Wire names of the operations the page asks the service worker to perform. */
export const OFFLINE_OPERATIONS = Object.freeze({
  modelStatus: 'MODEL_STATUS',
  modelManifest: 'MODEL_MANIFEST',
  downloadModel: 'DOWNLOAD_MODEL',
  alternateStatus: 'ALTERNATE_STATUS',
  downloadAlternate: 'DOWNLOAD_ALTERNATE',
  prepareAlternateFetch: 'PREPARE_ALTERNATE_FETCH',
  forgetAlternateFetch: 'FORGET_ALTERNATE_FETCH',
  alternateFetchPending: 'ALTERNATE_FETCH_PENDING',
  removeAlternate: 'REMOVE_ALTERNATE',
  getSettings: 'GET_SETTINGS',
  updateSettings: 'UPDATE_SETTINGS',
  queueStats: 'QUEUE_STATS',
  sync: 'SYNC',
} as const);

export type OfflineOperation = (typeof OFFLINE_OPERATIONS)[keyof typeof OFFLINE_OPERATIONS];

const OPERATION_NAMES: readonly string[] = Object.values(OFFLINE_OPERATIONS);

export function isOfflineOperation(value: unknown): value is OfflineOperation {
  return typeof value === 'string' && OPERATION_NAMES.includes(value);
}

/** `Request` is `undefined` for operations without a payload, and includes it when the payload is optional. */
interface OperationContract<Request, Result> {
  readonly request: Request;
  readonly result: Result;
}

/**
 * Payload and result of every operation. Both sides are typed from this map, so a missing handler or a
 * mismatched payload is a compile error rather than an "unknown operation" at run time.
 */
export interface OfflineOperationContracts {
  /** The verified installed model, or null when none is usable. */
  readonly [OFFLINE_OPERATIONS.modelStatus]: OperationContract<undefined, ModelManifest | null>;
  /** The model currently published, to show its size before downloading. */
  readonly [OFFLINE_OPERATIONS.modelManifest]: OperationContract<undefined, ModelManifest>;
  /** Downloads, verifies and activates a model; `manifestUrl` defaults to the published one. */
  readonly [OFFLINE_OPERATIONS.downloadModel]: OperationContract<{ readonly manifestUrl?: string } | undefined, ModelManifest>;
  /** The verified installed second model, or null when it is not installed or no longer intact. */
  readonly [OFFLINE_OPERATIONS.alternateStatus]: OperationContract<undefined, AlternateModel | null>;
  /** Downloads, verifies and installs the second model the published manifest describes. */
  readonly [OFFLINE_OPERATIONS.downloadAlternate]: OperationContract<undefined, AlternateModel>;
  /** Writes down what a background download of the second model is for, and tells the page what to hand the browser. */
  readonly [OFFLINE_OPERATIONS.prepareAlternateFetch]: OperationContract<undefined, AlternateFetchPlan>;
  /** Forgets a background download the browser did not take. */
  readonly [OFFLINE_OPERATIONS.forgetAlternateFetch]: OperationContract<undefined, undefined>;
  /** Whether a background download is still to be installed or discarded by the service worker. */
  readonly [OFFLINE_OPERATIONS.alternateFetchPending]: OperationContract<undefined, boolean>;
  /** Frees the space of the second model. */
  readonly [OFFLINE_OPERATIONS.removeAlternate]: OperationContract<undefined, undefined>;
  readonly [OFFLINE_OPERATIONS.getSettings]: OperationContract<undefined, OfflineSettings>;
  readonly [OFFLINE_OPERATIONS.updateSettings]: OperationContract<{ readonly changes: EditableSettings }, undefined>;
  readonly [OFFLINE_OPERATIONS.queueStats]: OperationContract<undefined, QueueStats>;
  readonly [OFFLINE_OPERATIONS.sync]: OperationContract<undefined, undefined>;
}

export type OfflineRequest<O extends OfflineOperation> = OfflineOperationContracts[O]['request'];
export type OfflineResult<O extends OfflineOperation> = OfflineOperationContracts[O]['result'];

/** The payload field may be left out exactly when the operation does not require one. */
type RequestField<O extends OfflineOperation> = undefined extends OfflineRequest<O>
  ? { readonly request?: OfflineRequest<O> }
  : { readonly request: OfflineRequest<O> };

/** Message the page posts to the service worker, with a reply `MessagePort` attached; a union when `O` is. */
export type OfflineRequestMessage<O extends OfflineOperation = OfflineOperation> = {
  readonly [K in O]: { readonly type: K } & RequestField<K>;
}[O];

export interface OfflineProgress { readonly received: number; readonly total: number }

/** Messages the service worker posts back: any number of progress updates, then exactly one outcome. */
export type OfflineReply<O extends OfflineOperation = OfflineOperation> =
  | { readonly progress: OfflineProgress }
  | { readonly ok: true; readonly result: OfflineResult<O> }
  | { readonly ok: false };
