import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { InferenceWorkerInbound } from './inference.types';

const runtime = vi.hoisted(() => ({
  create: vi.fn(), run: vi.fn(), release: vi.fn(), disposeInput: vi.fn(), disposeOutput: vi.fn(),
}));
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: runtime.create },
  Tensor: class { dispose = runtime.disposeInput; },
}));

describe('inference worker protocol', () => {
  let handle: (message: InferenceWorkerInbound) => Promise<void>;
  const postMessage = vi.fn();
  const loadRequest = { type: 'LOAD_MODEL', modelUrl: '/model.onnx', labelsUrl: '/labels.txt' } as const;
  const inferRequest = {
    type: 'INFER', audioBuffer: new Float32Array(144000), windowIndex: 3, timestamp: 100,
  } as const;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
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
    expect(postMessage).toHaveBeenCalledWith({ type: 'MODEL_LOADED', numClasses: 2, modelSizeBytes: 0 });
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

  it.each(['http', 'empty', 'runtime', 'shape'])('reports model load failure: %s', async (failure) => {
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
    if (failure === 'samples') request = { ...request, audioBuffer: new Float32Array(144000).fill(NaN) };
    if (failure === 'missing') runtime.run.mockResolvedValueOnce({});
    if (failure === 'output') runtime.run.mockResolvedValueOnce({ output: { data: [1, 2] } });
    if (failure === 'runtime') runtime.run.mockRejectedValueOnce(new Error('Execution failed'));
    if (failure === 'ranking') runtime.run.mockResolvedValueOnce({ output: { data: new Float32Array([NaN, 0]), dispose: runtime.disposeOutput } });
    await handle(request);
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'INFERENCE_ERROR', windowIndex: 3 }));
  });

  it('dispatches worker messages through the installed entry point', async () => {
    self.onmessage?.(new MessageEvent('message', { data: loadRequest }));
    await vi.waitFor(() => { expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'MODEL_LOADED' })); });
  });
});
