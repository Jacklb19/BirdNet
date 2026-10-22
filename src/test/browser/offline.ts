import { apiUrl } from '../../config/api';
import { InferenceService } from '../../features/inference/inference.service';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from '../../features/inference/inference.constants';
import { AUDIO_CONSTANTS } from '../../features/audio/dsp/audio.constants';
import { normalizeAudio } from '../../features/audio/dsp/normalize';
import { applyDetectionPolicy, type ClassifiedDetection } from '../../features/inference/detectionPolicy';
import { bindSyncSession, getSettings, persistDetections, queueStats, listDetections, updateSettings } from '../../features/offline/queueStore';
import { offlineOperation } from '../../features/offline/offlineClient';
import { DATABASE_NAME, MODEL_CACHE_NAME, MODEL_RESOURCE_EXTENSIONS, OFFLINE_OPERATIONS, STORES } from '../../features/offline/offline.constants';
import type { PersistenceContext, SyncSession } from '../../features/offline/types';
import { listWalks, saveWalk } from '../../features/walk/walkStore';
import { listNotes, saveNote } from '../../features/notes/noteStore';
import { forgetAccountOnPhone } from '../../features/account/accountDeletion';
import referenceRecordings from '../../../public/test-audio/metadata.json';

/** Public path of the reference recordings and of their metadata.json, both written by scripts/prepare-model.py. */
const REFERENCE_AUDIO_DIR = '/test-audio';
/** Recording classified offline; its file name and annotated song offset come from metadata.json. */
const REFERENCE_RECORDING_ID = 'XC915894';
const REFERENCE_CACHE_NAME = 'birdnet-browser-fixture';

/** The recording's URL, served by the e2e preview and cached before the page goes offline, and its first sample. */
function referenceRecording(): { url: string; startSample: number } {
  const reference = referenceRecordings.find((recording) => recording.id === REFERENCE_RECORDING_ID);
  if (!reference) throw new Error('The reference recording is missing from the test audio metadata.');
  return {
    url: `${REFERENCE_AUDIO_DIR}/${reference.filename}`,
    startSample: Math.round(reference.best_window_offset_sec * AUDIO_CONSTANTS.TARGET_SAMPLE_RATE),
  };
}
/** Routes of the backend's local e2e server (tests/local_server.py), behind the same API base as the app. */
const TEST_ROUTES = Object.freeze({ session: '/test/session', invalidManifest: '/test/invalid-manifest' });

/** A finished walk of an hour with a timed path of three cells, kept on the phone. */
async function seedWalk(): Promise<string> {
  const id = crypto.randomUUID();
  await saveWalk({
    id, startedAt: '2026-10-06T11:30:00.000Z', endedAt: '2026-10-06T12:30:00.000Z', lastAt: '2026-10-06T12:30:00.000Z', owner: null,
    track: [[4.679, -74.123, 0], [4.6791, -74.123, 60], [4.6791, -74.1231, 120]],
  }, 60);
  return id;
}

const context: PersistenceContext = { recordedAt: '2026-10-06T12:00:00Z', location: { latitude: 4.679, longitude: -74.123 }, modelVersion: 'birdnet-v2.4:arm' };
/** Size of the WAV fragment (one PCM16 window and its header) that versions before the upload was removed kept. */
const LEGACY_FRAGMENT_BYTES = 288_044;

function classified(confidence: number): ClassifiedDetection[] {
  return applyDetectionPolicy([{ classIndex: 0, scientificName: 'Turdus fuscater', commonName: 'Great Thrush', label: 'Turdus fuscater_Great Thrush', confidence }]);
}
async function seed(count: number, confidence = 0.9, withLocation = true): Promise<void> {
  const candidates = classified(confidence);
  for (let index = 0; index < count; index++) await persistDetections(candidates, { ...context, location: withLocation ? context.location : null });
}
/** One window with `size` detections: a single write, which the queue keeps whole or not at all. */
async function seedWindow(size: number): Promise<void> {
  await persistDetections(Array.from({ length: size }, () => classified(0.9)).flat(), context);
}
function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => { resolve(request.result); }; request.onerror = () => { reject(request.error ?? new Error('Storage request failed.')); }; });
}
/** Direct access to the queue database, for the state only an earlier version of the app could leave behind. */
async function inQueue<T>(mode: IDBTransactionMode, action: (transaction: IDBTransaction) => IDBRequest<T>): Promise<T> {
  const db = await settled(indexedDB.open(DATABASE_NAME));
  try {
    const transaction = db.transaction([STORES.detections, STORES.audio], mode);
    const done = new Promise<void>((resolve, reject) => { transaction.oncomplete = () => { resolve(); }; transaction.onabort = () => { reject(transaction.error ?? new Error('Storage transaction failed.')); }; });
    const result = await settled(action(transaction));
    await done;
    return result;
  } finally { db.close(); }
}
/**
 * Turns the first queued record into what the removed doubtful-audio upload left on a phone: its WAV fragment in the
 * `audio` store, and the record pointing at it and marked as already sent while the fragment waited.
 */
async function leaveLegacyFragment(): Promise<void> {
  const [record] = await listDetections();
  if (!record) throw new Error('Seed a record first.');
  const audioId = crypto.randomUUID();
  await inQueue('readwrite', (transaction) => {
    transaction.objectStore(STORES.audio).put({ id: audioId, blob: new Blob([new Uint8Array(LEGACY_FRAGMENT_BYTES)]), bytes: LEGACY_FRAGMENT_BYTES });
    return transaction.objectStore(STORES.detections).put({ ...record, audioId, metadataSynced: true });
  });
}
/** A record another account left waiting on this phone (a shared phone): deleting one account must not touch it. */
async function seedForeign(owner: string): Promise<string> {
  await seed(1);
  const records = await listDetections();
  const record = records.find((row) => !row.owner) ?? records.at(-1);
  if (!record) throw new Error('Seeding failed.');
  await inQueue('readwrite', (transaction) => transaction.objectStore(STORES.detections).put({ ...record, owner }));
  return record.id;
}
async function loadReference(): Promise<void> {
  const cache = await caches.open(REFERENCE_CACHE_NAME);
  await cache.add(referenceRecording().url);
}
async function inferReference(): Promise<string[]> {
  const { url, startSample } = referenceRecording();
  const cache = await caches.open(REFERENCE_CACHE_NAME);
  const response = await cache.match(url);
  if (!response) throw new Error('Load the local reference before going offline.');
  const audioContext = new AudioContext({ sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE });
  const decoded = await audioContext.decodeAudioData(await response.arrayBuffer());
  const raw = decoded.getChannelData(0).slice(startSample, startSample + AUDIO_CONSTANTS.WINDOW_SAMPLES);
  await audioContext.close();
  return new Promise((resolve, reject) => {
    const service = new InferenceService({
      // Stored with the version of whatever the person's choice made the service load, as the app does.
      onModelLoaded: () => {
        service.infer(normalizeAudio(raw), 1, performance.now(), TOP_K, MIN_CANDIDATE_CONFIDENCE, { ...context, modelVersion: service.getModelVersion() ?? context.modelVersion });
      },
      onInferenceResult: (detections) => { service.dispose(); resolve(detections.map((row) => row.scientificName)); },
      onStorageError: () => { service.dispose(); reject(new Error('Persistence failed.')); },
      onError: (error) => { service.dispose(); reject(new Error(error)); },
    });
    void service.loadModel();
  });
}
const checks = {
  seed, seedWindow, queueStats, listDetections, updateSettings, getSettings, loadReference, inferReference, leaveLegacyFragment, seedWalk, listWalks,
  seedForeign, forgetAccountOnPhone, saveNote, listNotes,
  legacyFragments: (): Promise<number> => inQueue('readonly', (transaction) => transaction.objectStore(STORES.audio).count()),
  synchronizeQueue: async (): Promise<void> => { await offlineOperation(OFFLINE_OPERATIONS.sync); },
  bind: async (claimUnowned = true): Promise<void> => {
    const response = await fetch(apiUrl(TEST_ROUTES.session));
    await bindSyncSession(await response.json() as SyncSession, claimUnowned);
  },
  logout: async (): Promise<void> => { await bindSyncSession(null); },
  cachedModel: async () => offlineOperation(OFFLINE_OPERATIONS.modelStatus),
  cachedAlternate: async () => offlineOperation(OFFLINE_OPERATIONS.alternateStatus),
  invalidUpdate: async (): Promise<void> => { await offlineOperation(OFFLINE_OPERATIONS.downloadModel, { manifestUrl: apiUrl(TEST_ROUTES.invalidManifest) }); },
  corruptModel: async (): Promise<void> => {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const key = (await cache.keys()).find((request) => request.url.endsWith(`.${MODEL_RESOURCE_EXTENSIONS.model}`));
    if (!key) throw new Error('No cached model.');
    await cache.put(key, new Response(new Uint8Array(10)));
  },
};
declare global { interface Window { offlineChecks: typeof checks } }
window.offlineChecks = checks;
