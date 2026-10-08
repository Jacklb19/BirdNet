import { apiUrl } from '../../config/api';
import { InferenceService } from '../../features/inference/inference.service';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from '../../features/inference/inference.constants';
import { AUDIO_CONSTANTS } from '../../features/audio/dsp/audio.constants';
import { normalizeAudio } from '../../features/audio/dsp/normalize';
import { applyDetectionPolicy } from '../../features/inference/detectionPolicy';
import { bindSyncSession, getSettings, persistDetections, queueStats, listDetections, updateSettings } from '../../features/offline/queueStore';
import { offlineOperation } from '../../features/offline/offlineClient';
import { MODEL_CACHE_NAME, MODEL_RESOURCE_EXTENSIONS, OFFLINE_OPERATIONS } from '../../features/offline/offline.constants';
import type { PersistenceContext, SyncSession } from '../../features/offline/types';
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

const context: PersistenceContext = { recordedAt: '2026-10-06T12:00:00Z', location: { latitude: 4.679, longitude: -74.123 }, modelVersion: 'birdnet-v2.4:arm' };
const samples = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
async function seed(count: number, confidence = 0.9, withLocation = true): Promise<void> {
  const candidates = applyDetectionPolicy([{ classIndex: 0, scientificName: 'Turdus fuscater', commonName: 'Great Thrush', label: 'Turdus fuscater_Great Thrush', confidence }]);
  for (let index = 0; index < count; index++) await persistDetections(candidates, samples, { ...context, location: withLocation ? context.location : null });
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
      onModelLoaded: () => { service.infer(normalizeAudio(raw), 1, performance.now(), TOP_K, MIN_CANDIDATE_CONFIDENCE, context); },
      onInferenceResult: (detections) => { service.dispose(); resolve(detections.map((row) => row.scientificName)); },
      onStorageError: () => { service.dispose(); reject(new Error('Persistence failed.')); },
      onError: (error) => { service.dispose(); reject(new Error(error)); },
    });
    void service.loadModel();
  });
}
const checks = {
  seed, queueStats, listDetections, updateSettings, getSettings, loadReference, inferReference,
  synchronizeQueue: async (): Promise<void> => { await offlineOperation(OFFLINE_OPERATIONS.sync); },
  bind: async (claimUnowned = true): Promise<void> => {
    const response = await fetch(apiUrl(TEST_ROUTES.session));
    await bindSyncSession(await response.json() as SyncSession, claimUnowned);
  },
  logout: async (): Promise<void> => { await bindSyncSession(null); },
  cachedModel: async () => offlineOperation(OFFLINE_OPERATIONS.modelStatus),
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
