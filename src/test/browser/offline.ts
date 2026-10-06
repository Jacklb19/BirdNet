import { InferenceService } from '../../features/inference/inference.service';
import { normalizeAudio } from '../../features/audio/dsp/normalize';
import { applyDetectionPolicy } from '../../features/inference/detectionPolicy';
import { bindSyncSession, getSettings, persistDetections, queueStats, listDetections, updateSettings } from '../../features/offline/queueStore';
import { offlineOperation } from '../../features/offline/offlineClient';
import type { PersistenceContext, SyncSession } from '../../features/offline/types';

const context: PersistenceContext = { recordedAt: '2026-10-06T12:00:00Z', location: { latitude: 4.679, longitude: -74.123 }, modelVersion: 'birdnet-v2.4:arm' };
const samples = new Float32Array(144000);
async function seed(count: number, confidence = 0.9, withLocation = true): Promise<void> {
  const candidates = applyDetectionPolicy([{ classIndex: 0, scientificName: 'Turdus fuscater', commonName: 'Great Thrush', label: 'Turdus fuscater_Great Thrush', confidence }]);
  for (let index = 0; index < count; index++) await persistDetections(candidates, samples, { ...context, location: withLocation ? context.location : null });
}
async function loadReference(): Promise<void> {
  const cache = await caches.open('birdnet-browser-fixture');
  await cache.add('/test-audio/XC915894-turdus-fuscater.wav');
}
async function inferReference(): Promise<string[]> {
  const cache = await caches.open('birdnet-browser-fixture');
  const response = await cache.match('/test-audio/XC915894-turdus-fuscater.wav');
  if (!response) throw new Error('Load the local reference before going offline.');
  const audioContext = new AudioContext({ sampleRate: 48000 });
  const decoded = await audioContext.decodeAudioData(await response.arrayBuffer());
  const raw = decoded.getChannelData(0).slice(26 * 48000, 29 * 48000);
  await audioContext.close();
  return new Promise((resolve, reject) => {
    const service = new InferenceService({
      onModelLoaded: () => { service.infer(normalizeAudio(raw), 1, performance.now(), 5, 0.45, context); },
      onInferenceResult: (detections) => { service.dispose(); resolve(detections.map((row) => row.scientificName)); },
      onStorageError: () => { service.dispose(); reject(new Error('Persistence failed.')); },
      onError: (error) => { service.dispose(); reject(new Error(error)); },
    });
    void service.loadModel();
  });
}
const checks = {
  seed, queueStats, listDetections, updateSettings, getSettings, loadReference, inferReference,
  synchronizeQueue: async (): Promise<void> => { await offlineOperation('SYNC'); },
  bind: async (claimUnowned = true): Promise<void> => {
    const response = await fetch('/api/test/session');
    await bindSyncSession(await response.json() as SyncSession, claimUnowned);
  },
  logout: async (): Promise<void> => { await bindSyncSession(null); },
  cachedModel: async () => offlineOperation('MODEL_STATUS'),
  invalidUpdate: async (): Promise<void> => { await offlineOperation('DOWNLOAD_MODEL', { manifestUrl: '/api/test/invalid-manifest' }); },
  corruptModel: async (): Promise<void> => {
    const cache = await caches.open('birdnet-models-v1');
    const key = (await cache.keys()).find((request) => request.url.endsWith('.onnx'));
    if (!key) throw new Error('No cached model.');
    await cache.put(key, new Response(new Uint8Array(10)));
  },
};
declare global { interface Window { offlineChecks: typeof checks } }
window.offlineChecks = checks;
