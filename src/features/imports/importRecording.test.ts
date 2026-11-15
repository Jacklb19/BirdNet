import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InferenceCallbacks } from '../inference/inference.service';
import type { PersistenceContext } from '../offline/types';
import { importRecording } from './importRecording';
import { importIsActive } from './importActivity';

const doubles = vi.hoisted(() => ({ owner: '00000000-0000-4000-8000-000000000001', readable: true, decodable: true, duration: 6, rate: 48000, channels: 2,
  frames: 288000, gap: false, modelError: false, storageError: false, contexts: [] as PersistenceContext[], close: vi.fn(), release: vi.fn(), save: vi.fn(), change: vi.fn(), sync: vi.fn() }));
vi.mock('mediabunny', () => ({ WAVE: {}, MP3: {}, MP4: {}, OGG: {}, FLAC: {}, WEBM: {}, BlobSource: vi.fn(),
  Input: class { canRead() { return Promise.resolve(doubles.readable); } getPrimaryAudioTrack() { return Promise.resolve({ canDecode: () => Promise.resolve(doubles.decodable), getSampleRate: () => Promise.resolve(doubles.rate), getNumberOfChannels: () => Promise.resolve(doubles.channels), getFirstTimestamp: () => Promise.resolve(0) }); } getDurationFromMetadata() { return Promise.resolve(doubles.duration); } dispose() { /* No external resources in this decoder double. */ } },
  AudioSampleSink: class { async *samples() { await Promise.resolve(); yield { sampleRate: doubles.rate, numberOfChannels: doubles.channels, timestamp: 0, duration: doubles.duration, numberOfFrames: doubles.frames,
    copyTo: (target: Float32Array) => target.fill(0.2), close: doubles.close }; } },
}));
vi.mock('../offline/queueStore', () => ({ getSettings: () => Promise.resolve({ session: { userId: doubles.owner } }) }));
vi.mock('../offline/offlineClient', () => ({ scheduleSynchronization: doubles.sync }));
vi.mock('../journal/journalStore', () => ({ saveEntity: doubles.save, changeEntry: doubles.change, entityKey: (owner: string, kind: string, id: string) => `${owner}:${kind}:${id}` }));
vi.mock('../inference/inference.service', () => ({ InferenceService: class {
  constructor(private callbacks: InferenceCallbacks) {}
  loadModel() { if (doubles.modelError) this.callbacks.onError?.('Unavailable'); else this.callbacks.onModelLoaded?.(1); return Promise.resolve(); }
  getModelVersion() { return 'existing-model'; }
  infer(_window: Float32Array, index: number, _time: number, _k: number, _minimum: number, context: PersistenceContext) {
    doubles.contexts.push(context);
    if (doubles.storageError) this.callbacks.onStorageError?.();
    else this.callbacks.onInferenceResult?.([{ classIndex: 0, scientificName: 'Turdus fuscater', commonName: 'Great Thrush', label: 'Turdus fuscater_Great Thrush', confidence: 0.9 }], index, 0, 1, 1, null);
  }
  disposeAndWait() { doubles.release(); return Promise.resolve(); }
} }));
const owner = '00000000-0000-4000-8000-000000000001';
const options = { owner, save: false, recordedAt: null, location: null, title: null };
const file = (): File => new File([new Uint8Array(100)], 'unknown-date.wav', { type: 'audio/wav', lastModified: 0 });
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(doubles, { owner, readable: true, decodable: true, duration: 6, rate: 48000, channels: 2, frames: 288000, modelError: false, storageError: false });
  doubles.contexts.length = 0; doubles.save.mockResolvedValue('00000000-0000-4000-8000-000000000002'); doubles.change.mockResolvedValue(undefined); doubles.sync.mockResolvedValue(undefined);
});
describe('incremental local recording analysis', () => {
  it('analyzes sequential windows with unknown original metadata and never stores temporary results', async () => {
    const result = await importRecording(file(), options, vi.fn(), new AbortController());
    expect(result).toMatchObject({ windows: 3, cancelled: false, seconds: 6, outingId: null });
    expect(result.species[0]).toMatchObject({ scientificName: 'Turdus fuscater', windows: 3 });
    expect(doubles.contexts).toHaveLength(3);
    expect(doubles.contexts.every((context) => context.recordedAt === null && context.location === null && context.historical === true && context.store === false)).toBe(true);
    expect(doubles.save).not.toHaveBeenCalled(); expect(doubles.close).toHaveBeenCalledTimes(1); expect(doubles.release).toHaveBeenCalledTimes(1); expect(importIsActive()).toBe(false);
  });
  it('keeps the chosen capture time, explicit location and partial results on cancellation', async () => {
    const controller = new AbortController();
    const result = await importRecording(file(), { ...options, save: true, recordedAt: '2025-03-04T10:06:00Z', location: { latitude: 4.6789, longitude: -74.1234 }, title: 'Dawn' },
      (progress) => { if (progress.windows === 1) controller.abort(); }, controller);
    expect(result).toMatchObject({ windows: 1, cancelled: true });
    expect(doubles.contexts[0]).toMatchObject({ recordedAt: '2025-03-04T10:06:03.000Z', historical: true, store: true, location: { latitude: 4.6789, longitude: -74.1234 } });
    expect(doubles.save).toHaveBeenCalledTimes(1); expect(doubles.change).toHaveBeenCalledTimes(2); expect(doubles.release).toHaveBeenCalledTimes(1); expect(importIsActive()).toBe(false);
  });
  it.each(['container', 'codec', 'duration', 'channels', 'rate', 'owner', 'model', 'storage'] as const)('releases decoder and model after a %s failure', async (failure) => {
    if (failure === 'container') doubles.readable = false;
    if (failure === 'codec') doubles.decodable = false;
    if (failure === 'duration') doubles.duration = 2;
    if (failure === 'channels') doubles.channels = 0;
    if (failure === 'rate') doubles.rate = 200000;
    if (failure === 'owner') doubles.owner = 'different';
    if (failure === 'model') doubles.modelError = true;
    if (failure === 'storage') doubles.storageError = true;
    await expect(importRecording(file(), options, vi.fn(), new AbortController())).rejects.toThrow();
    expect(doubles.release).toHaveBeenCalledTimes(1); expect(importIsActive()).toBe(false);
  });
  it('rejects saving an undated recording and handles cancellation before decoding', async () => {
    await expect(importRecording(file(), { ...options, save: true }, vi.fn(), new AbortController())).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    expect(await importRecording(file(), options, vi.fn(), controller)).toMatchObject({ windows: 0, cancelled: true });
    expect(doubles.contexts).toEqual([]);
  });
});
