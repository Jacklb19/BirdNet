/** InferenceService lifecycle against a simulated worker: model load, inference and cleanup. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InferenceService } from './inference.service';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from './inference.constants';
import { STATIC_MANIFEST_URL } from './modelManifest';
import type { InferenceWorkerOutbound } from './inference.types';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';
import { MODEL_CACHE_PATH_PREFIX, OFFLINE_OPERATIONS } from '../offline/offline.constants';

const offline = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../offline/offlineClient', () => ({ offlineOperation: offline.operation }));

class MockWorker {
  public onmessage: ((event: MessageEvent<InferenceWorkerOutbound>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;

  public postMessage = vi.fn();
  public terminate = vi.fn();

  /** Delivers a worker message to the main thread. */
  public simulateMessage(data: InferenceWorkerOutbound): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const mockManifest = {
  model_id: 'birdnet-v2.4',
  variant: 'test.onnx',
  sample_rate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
  window_samples: AUDIO_CONSTANTS.WINDOW_SAMPLES,
  window_seconds: AUDIO_CONSTANTS.WINDOW_DURATION_SEC,
  num_classes: 6522,
  sha256: 'a'.repeat(64),
  size_bytes: 1000000,
  labels_file: 'labels.txt',
  model_file: 'birdnet_model.onnx',
  updated_at: '2026-09-29',
};

let mockWorkerInstance: MockWorker;

describe('InferenceService', () => {
  beforeEach(() => {
    mockWorkerInstance = new MockWorker();

    vi.stubGlobal(
      'Worker',
      class {
        public postMessage = mockWorkerInstance.postMessage;
        public terminate = mockWorkerInstance.terminate;

        public set onmessage(handler: ((event: MessageEvent<InferenceWorkerOutbound>) => void) | null) {
          mockWorkerInstance.onmessage = handler;
        }

        public get onmessage(): ((event: MessageEvent<InferenceWorkerOutbound>) => void) | null {
          return mockWorkerInstance.onmessage;
        }

        public set onerror(handler: ((event: ErrorEvent) => void) | null) {
          mockWorkerInstance.onerror = handler;
        }

        public get onerror(): ((event: ErrorEvent) => void) | null {
          return mockWorkerInstance.onerror;
        }
      },
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockManifest),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts idle', () => {
    const service = new InferenceService();
    expect(service.getStatus()).toBe('idle');
  });

  it('moves to loading while the model loads', async () => {
    const onStatusChange = vi.fn();
    const service = new InferenceService({ onStatusChange });

    await service.loadModel('/models/manifest.json');

    expect(onStatusChange).toHaveBeenCalledWith('loading');
    expect(service.getManifest()).toEqual(mockManifest);
  });

  it('becomes ready when the worker reports MODEL_LOADED', async () => {
    const onStatusChange = vi.fn();
    const onModelLoaded = vi.fn();
    const service = new InferenceService({ onStatusChange, onModelLoaded });

    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    expect(onStatusChange).toHaveBeenCalledWith('ready');
    expect(onModelLoaded).toHaveBeenCalledWith(6522);
    expect(service.getStatus()).toBe('ready');
  });

  it('moves to error when the worker reports MODEL_ERROR', async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    const service = new InferenceService({ onStatusChange, onError });

    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_ERROR',
      error: 'WASM unsupported',
    });

    expect(onStatusChange).toHaveBeenCalledWith('error');
    expect(onError).toHaveBeenCalledWith('WASM unsupported');
  });

  it('sends LOAD_MODEL with resources resolved against the manifest and its declared sizes', async () => {
    const service = new InferenceService();

    await service.loadModel();

    expect(fetch).toHaveBeenCalledWith(STATIC_MANIFEST_URL);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: 'LOAD_MODEL',
      modelUrl: new URL(mockManifest.model_file, new URL(STATIC_MANIFEST_URL, location.origin)).href,
      labelsUrl: new URL(mockManifest.labels_file, new URL(STATIC_MANIFEST_URL, location.origin)).href,
      windowSamples: mockManifest.window_samples,
      modelSizeBytes: mockManifest.size_bytes,
    });
  });

  it('loads the cached model from the same-origin paths the service worker serves', async () => {
    const cached = {
      ...mockManifest,
      model_file: `${MODEL_CACHE_PATH_PREFIX}model.onnx`,
      labels_file: `${MODEL_CACHE_PATH_PREFIX}labels.txt`,
    };
    offline.operation.mockResolvedValueOnce(cached);
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
    try {
      // A manifest on another host must not move the cached files there.
      await new InferenceService().loadModel('https://models.example.org/birdnet/manifest.json');
    } finally {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
    expect(offline.operation).toHaveBeenCalledWith(OFFLINE_OPERATIONS.modelStatus);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      modelUrl: new URL(cached.model_file, location.origin).href,
      labelsUrl: new URL(cached.labels_file, location.origin).href,
    }));
  });

  it('does not send INFER before the model is ready', () => {
    const service = new InferenceService();
    const buffer = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);

    service.infer(buffer, 0, Date.now());

    expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled();
  });

  it('sends INFER to the worker once the model is ready', async () => {
    const service = new InferenceService();
    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    const buffer = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    const timestamp = Date.now();

    service.infer(buffer, 42, timestamp, 3, 0.2);

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'INFER',
        windowIndex: 42,
        timestamp,
        topK: 3,
        minConfidence: 0.2,
      }),
      [buffer.buffer],
    );
  });

  it('ranks with the policy defaults when no options are given', async () => {
    const service = new InferenceService();
    await service.loadModel();
    mockWorkerInstance.simulateMessage({ type: 'MODEL_LOADED', numClasses: 6522, modelSizeBytes: 1000000 });

    service.infer(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), 1, 0);

    expect(mockWorkerInstance.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'INFER', topK: TOP_K, minConfidence: MIN_CANDIDATE_CONFIDENCE }),
      [expect.any(ArrayBuffer)],
    );
  });

  it('calls onInferenceResult for INFERENCE_RESULT', async () => {
    const onInferenceResult = vi.fn();
    const service = new InferenceService({ onInferenceResult });
    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    service.infer(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), 1, 123456);
    mockWorkerInstance.simulateMessage({
      type: 'INFERENCE_RESULT',
      detections: [
        {
          classIndex: 0,
          label: 'Turdus fuscater_Great Thrush',
          scientificName: 'Turdus fuscater',
          commonName: 'Great Thrush',
          confidence: 0.89,
        },
      ],
      windowIndex: 1,
      timestamp: 123456,
      latencyMs: 15.2,
      regionSpecies: 529,
    });

    expect(onInferenceResult).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ scientificName: 'Turdus fuscater' }),
      ]),
      1,
      123456,
      15.2,
      expect.any(Number),
      529,
    );
  });

  it('releases resources on dispose', async () => {
    const service = new InferenceService();
    await service.loadModel('/models/manifest.json');

    service.dispose();

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({ type: 'DISPOSE' });
    expect(mockWorkerInstance.terminate).not.toHaveBeenCalled();
    mockWorkerInstance.simulateMessage({ type: 'DISPOSED' });
    expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    expect(service.getStatus()).toBe('idle');
    expect(service.getManifest()).toBeNull();
  });

  it('keeps only the latest pending inference and includes queue time in latency', async () => {
    const onWindowDropped = vi.fn();
    const onInferenceResult = vi.fn();
    const service = new InferenceService({ onWindowDropped, onInferenceResult });
    await service.loadModel();
    mockWorkerInstance.simulateMessage({ type: 'MODEL_LOADED', numClasses: 6522, modelSizeBytes: 1000000 });
    vi.spyOn(performance, 'now').mockReturnValue(200);
    for (let index = 0; index < 1000; index++) service.infer(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), index, 100);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(2);
    expect(onWindowDropped).toHaveBeenCalledTimes(998);
    mockWorkerInstance.simulateMessage({ type: 'INFERENCE_RESULT', detections: [], windowIndex: 0, timestamp: 100, latencyMs: 20, regionSpecies: null });
    expect(onInferenceResult).toHaveBeenCalledWith([], 0, 100, 20, 100, null);
    expect(mockWorkerInstance.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ windowIndex: 999 }), [expect.any(ArrayBuffer)],
    );
    mockWorkerInstance.simulateMessage({ type: 'INFERENCE_ERROR', error: 'Failed', windowIndex: 999, timestamp: 100 });
    service.infer(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), 1000, 200);
    expect(mockWorkerInstance.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ windowIndex: 1000 }), [expect.any(ArrayBuffer)],
    );
  });

  it('ignores results from a disposed worker and cancels a late manifest response', async () => {
    const onInferenceResult = vi.fn();
    const service = new InferenceService({ onInferenceResult });
    await service.loadModel();
    const oldHandler = mockWorkerInstance.onmessage;
    service.dispose();
    oldHandler?.(new MessageEvent('message', { data: { type: 'MODEL_LOADED', numClasses: 6522, modelSizeBytes: 0 } }));
    expect(service.getStatus()).toBe('idle');
    expect(onInferenceResult).not.toHaveBeenCalled();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const loading = service.loadModel();
    service.dispose();
    resolveFetch?.({ ok: true, json: () => Promise.resolve(mockManifest) } as Response);
    await loading;
    expect(service.getManifest()).toBeNull();
    expect(service.getStatus()).toBe('idle');
  });

  it('reports bad manifests, HTTP failures, malformed windows and fatal worker errors', async () => {
    const onError = vi.fn();
    const service = new InferenceService({ onError });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await service.loadModel();
    expect(service.getStatus()).toBe('error');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ...mockManifest, sample_rate: 1 }) } as Response);
    await service.loadModel();
    expect(onError).toHaveBeenLastCalledWith('Incompatible manifest.');
    expect(service.getManifest()).toBeNull();
    await service.loadModel();
    mockWorkerInstance.simulateMessage({ type: 'MODEL_LOADED', numClasses: 1, modelSizeBytes: 0 });
    expect(service.getStatus()).toBe('error');
    await service.loadModel();
    mockWorkerInstance.simulateMessage({ type: 'MODEL_LOADED', numClasses: 6522, modelSizeBytes: 0 });
    service.infer(new Float32Array(1), 0, 0);
    expect(onError).toHaveBeenLastCalledWith('Invalid audio window.');
    mockWorkerInstance.onerror?.(new ErrorEvent('error', { message: 'Worker crashed' }));
    expect(service.getStatus()).toBe('error');
  });
});
