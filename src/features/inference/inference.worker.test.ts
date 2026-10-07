import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { InferenceWorkerInbound, LoadModelRequest } from './inference.types';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';

const runtime = vi.hoisted(() => ({
  create: vi.fn(), run: vi.fn(), release: vi.fn(), disposeInput: vi.fn(), disposeOutput: vi.fn(),
}));
const persistence = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../offline/queueStore', () => ({ persistDetections: persistence.save }));
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: runtime.create },
  Tensor: class { dispose = runtime.disposeInput; },
}));

describe('inference worker protocol', () => {
  let handle: (message: InferenceWorkerInbound) => Promise<void>;
  const postMessage = vi.fn();
  const loadRequest: LoadModelRequest = {
    type: 'LOAD_MODEL', modelUrl: '/model.onnx', labelsUrl: '/labels.txt',
    windowSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES, modelSizeBytes: 1_000_000,
  };
  const inferRequest = {
    type: 'INFER', audioBuffer: new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), windowIndex: 3, timestamp: 100,
  } as const;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    persistence.save.mockResolvedValue(undefined);
    vi.stubGlobal('self', { location: { href: 'http://localhost:5173/' }, postMessage, onmessage: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: () => Promise.resolve('Turdus fuscater_Great Thrush\nZonotrichia capensis_Rufous-collared Sparrow'),
    }));
    runtime.create.mockResolvedValue({
      inputNames: ['input'], outputNames: ['output'], run: runtime.run, release: runtime.release,
    });
    runtime.run.mockResolvedValue({ output: { data: new Float32Array([3, -3]), dispose: runtime.disposeOutput } });
    runtime.release.mockResolvedValue(undefined);
    handle = (await import('./inference.worker')).handleWorkerRequest;
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads the model, classifies raw audio and disposes tensors', async () => {
    await handle(loadRequest);
    expect(postMessage).toHaveBeenCalledWith({ type: 'MODEL_LOADED', numClasses: 2, modelSizeBytes: loadRequest.modelSizeBytes });
    await handle(inferRequest);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'INFERENCE_RESULT', windowIndex: 3, timestamp: 100,
    }));
    const response = postMessage.mock.lastCall?.[0] as { latencyMs: number; detections: { scientificName: string; confidence: number }[] };
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.detections[0]?.scientificName).toBe('Turdus fuscater');
    expect(response.detections[0]?.confidence).toBeCloseTo(0.952574, 5);
    expect(runtime.disposeInput).toHaveBeenCalled();
    expect(runtime.disposeOutput).toHaveBeenCalled();
    await handle({ type: 'DISPOSE' });
    expect(runtime.release).toHaveBeenCalled();
    await handle(inferRequest);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INFERENCE_ERROR' }));
    await handle({ type: 'DISPOSE' });
  });

  it.each(['window', 'http', 'empty', 'runtime', 'shape'])('reports model load failure: %s', async (failure) => {
    if (failure === 'window') {
      await handle({ ...loadRequest, windowSamples: 0 });
      expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'MODEL_ERROR' }));
      return;
    }
    if (failure === 'http') vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    if (failure === 'empty') vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('\n') } as Response);
    if (failure === 'runtime') runtime.create.mockRejectedValueOnce('WASM failed');
    if (failure === 'shape') runtime.create.mockResolvedValueOnce({ inputNames: [], outputNames: [] });
    await handle(loadRequest);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'MODEL_ERROR' }));
  });

  it.each(['length', 'samples', 'missing', 'output', 'runtime', 'ranking'])('rejects invalid inference: %s', async (failure) => {
    await handle(loadRequest);
    let request = { ...inferRequest };
    if (failure === 'length') request = { ...request, audioBuffer: new Float32Array(10) };
    if (failure === 'samples') request = { ...request, audioBuffer: new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES).fill(NaN) };
    if (failure === 'missing') runtime.run.mockResolvedValueOnce({});
    if (failure === 'output') runtime.run.mockResolvedValueOnce({ output: { data: [1, 2] } });
    if (failure === 'runtime') runtime.run.mockRejectedValueOnce(new Error('Execution failed'));
    if (failure === 'ranking') runtime.run.mockResolvedValueOnce({ output: { data: new Float32Array([NaN, 0]), dispose: runtime.disposeOutput } });
    await handle(request);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INFERENCE_ERROR', windowIndex: 3 }));
  });

  it('gives ONNX Runtime fresh session options it can write into', async () => {
    // Regression: the runtime adds its own settings to the options object, so a frozen one broke every load.
    await handle(loadRequest);
    await handle(loadRequest);
    const [first, second] = runtime.create.mock.calls.map((call) => call[1] as object);
    expect(first).not.toBe(second);
    expect(Object.isExtensible(first)).toBe(true);
  });

  it('sizes the input from the window length the manifest declares', async () => {
    const windowSamples = 16;
    await handle({ ...loadRequest, windowSamples });
    await handle({ ...inferRequest, audioBuffer: new Float32Array(windowSamples) });
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INFERENCE_RESULT' }));
  });

  it('dispatches worker messages through the installed entry point', async () => {
    self.onmessage?.(new MessageEvent('message', { data: loadRequest }));
    await vi.waitFor(() => { expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'MODEL_LOADED' })); });
  });

  it('publishes a classified window only after persistent storage commits', async () => {
    await handle(loadRequest);
    postMessage.mockClear();
    let commit: (() => void) | undefined;
    persistence.save.mockReturnValueOnce(new Promise<void>((resolve) => { commit = resolve; }));
    const pending = handle({ ...inferRequest, persistence: { recordedAt: '2026-10-06T12:00:00Z', location: null, modelVersion: 'test-model' } });
    await vi.waitFor(() => { expect(persistence.save).toHaveBeenCalled(); });
    expect(postMessage).not.toHaveBeenCalled();
    commit?.();
    await pending;
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'INFERENCE_RESULT' }));
  });

  it('reports storage failure instead of publishing an unsaved detection', async () => {
    await handle(loadRequest);
    postMessage.mockClear();
    persistence.save.mockRejectedValueOnce(new Error('Quota exhausted'));
    await handle({ ...inferRequest, persistence: { recordedAt: '2026-10-06T12:00:00Z', location: null, modelVersion: 'test-model' } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'INFERENCE_ERROR', reason: 'storage' }));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'INFERENCE_RESULT' }));
  });

  it('acknowledges shutdown even if runtime release fails', async () => {
    await handle(loadRequest);
    runtime.release.mockRejectedValueOnce(new Error('Release failed'));
    postMessage.mockClear();
    self.onmessage?.(new MessageEvent('message', { data: { type: 'DISPOSE' } }));
    await vi.waitFor(() => { expect(postMessage).toHaveBeenCalledWith({ type: 'DISPOSED' }); });
    expect(postMessage).toHaveBeenCalledWith({ type: 'MODEL_ERROR', error: 'Release failed' });
  });
});
