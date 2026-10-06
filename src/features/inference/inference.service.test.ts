/**
 * Tests del InferenceService con Worker simulado.
 * Verifica el ciclo de vida: carga de modelo, inferencia y cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InferenceService } from './inference.service';
import type { InferenceWorkerOutbound } from './inference.types';

// Mock del Worker: simula postMessage / onmessage
class MockWorker {
  public onmessage: ((event: MessageEvent<InferenceWorkerOutbound>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;

  public postMessage = vi.fn();
  public terminate = vi.fn();

  /** Simula un mensaje del Worker hacia el hilo principal */
  public simulateMessage(data: InferenceWorkerOutbound): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

// Mock global de fetch para el manifiesto
const mockManifest = {
  model_id: 'birdnet-v2.4',
  variant: 'test.onnx',
  sample_rate: 48000,
  window_samples: 144000,
  window_seconds: 3.0,
  num_classes: 6522,
  sha256: 'abc123',
  size_bytes: 1000000,
  labels_file: 'labels.txt',
  model_file: 'birdnet_model.onnx',
  updated_at: '2026-09-29',
};

let mockWorkerInstance: MockWorker;

describe('InferenceService', () => {
  beforeEach(() => {
    mockWorkerInstance = new MockWorker();

    // Mock de URL constructor para módulos
    vi.stubGlobal('URL', class MockURL {
      constructor(public href: string, public base?: string) {}
      toString(): string { return this.href; }
    });

    // Mock de Worker constructor
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

    // Mock de fetch para manifiesto
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockManifest),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('inicia en estado idle', () => {
    const service = new InferenceService();
    expect(service.getStatus()).toBe('idle');
  });

  it('transiciona a loading al cargar modelo', async () => {
    const onStatusChange = vi.fn();
    const service = new InferenceService({ onStatusChange });

    await service.loadModel('/models/manifest.json');

    expect(onStatusChange).toHaveBeenCalledWith('loading');
    expect(service.getManifest()).toEqual(mockManifest);
  });

  it('transiciona a ready cuando el Worker reporta MODEL_LOADED', async () => {
    const onStatusChange = vi.fn();
    const onModelLoaded = vi.fn();
    const service = new InferenceService({ onStatusChange, onModelLoaded });

    await service.loadModel('/models/manifest.json');

    // Simular respuesta del Worker
    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    expect(onStatusChange).toHaveBeenCalledWith('ready');
    expect(onModelLoaded).toHaveBeenCalledWith(6522);
    expect(service.getStatus()).toBe('ready');
  });

  it('transiciona a error cuando el Worker reporta MODEL_ERROR', async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    const service = new InferenceService({ onStatusChange, onError });

    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_ERROR',
      error: 'WASM no soportado',
    });

    expect(onStatusChange).toHaveBeenCalledWith('error');
    expect(onError).toHaveBeenCalledWith('WASM no soportado');
  });

  it('envía LOAD_MODEL al Worker con URLs correctas', async () => {
    const service = new InferenceService();

    await service.loadModel('/models/manifest.json');

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: 'LOAD_MODEL',
      modelUrl: '/models/birdnet_model.onnx',
      labelsUrl: '/models/labels.txt',
    });
  });

  it('no envía INFER si el modelo no está listo', () => {
    const service = new InferenceService();
    const buffer = new Float32Array(144000);

    service.infer(buffer, 0, Date.now());

    expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled();
  });

  it('envía INFER al Worker cuando el modelo está ready', async () => {
    const service = new InferenceService();
    await service.loadModel('/models/manifest.json');

    // Marcar como ready
    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    const buffer = new Float32Array(144000);
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

  it('invoca onInferenceResult al recibir INFERENCE_RESULT', async () => {
    const onInferenceResult = vi.fn();
    const service = new InferenceService({ onInferenceResult });
    await service.loadModel('/models/manifest.json');

    mockWorkerInstance.simulateMessage({
      type: 'MODEL_LOADED',
      numClasses: 6522,
      modelSizeBytes: 1000000,
    });

    service.infer(new Float32Array(144000), 1, 123456);
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
    });

    expect(onInferenceResult).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ scientificName: 'Turdus fuscater' }),
      ]),
      1,
      123456,
      15.2,
      expect.any(Number),
    );
  });

  it('limpia recursos al llamar dispose', async () => {
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
    for (let index = 0; index < 1000; index++) service.infer(new Float32Array(144000), index, 100);
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(2);
    expect(onWindowDropped).toHaveBeenCalledTimes(998);
    mockWorkerInstance.simulateMessage({ type: 'INFERENCE_RESULT', detections: [], windowIndex: 0, timestamp: 100, latencyMs: 20 });
    expect(onInferenceResult).toHaveBeenCalledWith([], 0, 100, 20, 100);
    expect(mockWorkerInstance.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ windowIndex: 999 }), [expect.any(ArrayBuffer)],
    );
    mockWorkerInstance.simulateMessage({ type: 'INFERENCE_ERROR', error: 'Failed', windowIndex: 999, timestamp: 100 });
    service.infer(new Float32Array(144000), 1000, 200);
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
    expect(onError).toHaveBeenLastCalledWith('Incompatible model manifest.');
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
