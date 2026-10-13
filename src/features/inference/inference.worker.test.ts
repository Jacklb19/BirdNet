import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { InferenceWorkerInbound, LoadModelRequest, ModelSource } from './inference.types';
import { DECISION_RULE } from './inference.constants';
import { SINGLE_WINDOW } from './windowPooling';
import { AUDIO_CONSTANTS } from '../audio/dsp/audio.constants';

const runtime = vi.hoisted(() => ({
  create: vi.fn(), run: vi.fn(), release: vi.fn(), disposeInput: vi.fn(), disposeOutput: vi.fn(),
}));
const persistence = vi.hoisted(() => ({ save: vi.fn(), keepClips: vi.fn() }));
/** Called with the length of every tensor the worker builds. */
const tensors = vi.hoisted(() => ({ created: vi.fn() }));
vi.mock('../offline/queueStore', () => ({ persistDetections: persistence.save }));
vi.mock('../recordings/songClips', () => ({ keepSongClips: persistence.keepClips, forgetSongs: vi.fn() }));
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: {} },
  InferenceSession: { create: runtime.create },
  Tensor: class {
    dispose = runtime.disposeInput;
    constructor(_type: string, data: Float32Array) { tensors.created(data.length); }
  },
}));

describe('inference worker protocol', () => {
  let handle: (message: InferenceWorkerInbound) => Promise<void>;
  const postMessage = vi.fn();
  const source: ModelSource = {
    modelUrls: ['/model.onnx'], labelsUrl: '/labels.txt',
    sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE, windowSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES,
  };
  const capture = { sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE, windowSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES };
  const loadRequest: LoadModelRequest = { type: 'LOAD_MODEL', models: [source], capture, modelSizeBytes: 1_000_000, decisionRule: DECISION_RULE };
  const inferRequest = {
    type: 'INFER', audioBuffer: new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), windowIndex: 3, timestamp: 100,
  } as const;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    persistence.save.mockResolvedValue([]);
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

  it('decides with the window before: a doubtful call must be heard twice, a sure one stands, a gap starts over', async () => {
    await handle(loadRequest);
    const logit = (confidence: number): number => Math.log(confidence / (1 - confidence));
    /** Confidence the worker reports for the first label when its window alone scores `alone`. */
    const heard = async (windowIndex: number, alone: number): Promise<number | undefined> => {
      runtime.run.mockResolvedValueOnce({ output: { data: new Float32Array([logit(alone), -20]), dispose: runtime.disposeOutput } });
      await handle({ ...inferRequest, windowIndex });
      const response = postMessage.mock.lastCall?.[0] as { detections: { confidence: number }[] };
      return response.detections[0]?.confidence;
    };
    // The first window of a session has no neighbour and decides alone.
    expect(await heard(0, 0.7)).toBeCloseTo(0.7);
    // Heard again more faintly: the average keeps it, though this window alone would have been discarded.
    expect(await heard(1, 0.3)).toBeCloseTo(0.5);
    // A doubtful call after near silence is averaged away...
    expect(await heard(2, 0.05)).toBeUndefined();
    expect(await heard(3, 0.6)).toBeUndefined();
    // ...while a sure one stands whatever came before.
    expect(await heard(4, 0.9)).toBeCloseTo(0.9);
    // After a dropped window the next one is not a neighbour of the last.
    expect(await heard(6, 0.6)).toBeCloseTo(0.6);
    // A new model starts with no memory of the previous session.
    await handle(loadRequest);
    expect(await heard(7, 0.5)).toBeCloseTo(0.5);
  });

  it('lets every window decide alone when the person chose the wide rule', async () => {
    await handle({ ...loadRequest, decisionRule: SINGLE_WINDOW });
    const logit = (confidence: number): number => Math.log(confidence / (1 - confidence));
    for (const [windowIndex, alone] of [[0, 0.05], [1, 0.6]] as const) {
      runtime.run.mockResolvedValueOnce({ output: { data: new Float32Array([logit(alone), -20]), dispose: runtime.disposeOutput } });
      await handle({ ...inferRequest, windowIndex });
    }
    // Under the careful rule the quiet window before it would have averaged this one away.
    const response = postMessage.mock.lastCall?.[0] as { detections: { confidence: number }[] };
    expect(response.detections[0]?.confidence).toBeCloseTo(0.6);
  });

  it('makes two models decide together: a species is as likely as the mean of what each heard', async () => {
    const modelRate = 32_000;
    const second: ModelSource = {
      modelUrls: ['/second.part1.onnx', '/second.part2.onnx'], labelsUrl: '/second-labels.txt',
      sampleRate: modelRate, windowSamples: modelRate * AUDIO_CONSTANTS.WINDOW_DURATION_SEC,
    };
    // The second model knows the sparrow under the same name and one bird the first does not have.
    vi.mocked(fetch).mockImplementation((requested) => {
      const url = requested as string;
      return Promise.resolve((url.endsWith('.onnx')
      ? { ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer) }
      : { ok: true, text: () => Promise.resolve(url.includes('second')
        ? 'Zonotrichia capensis_Rufous-collared Sparrow\nGrallaria ruficapilla_Chestnut-crowned Antpitta'
        : 'Turdus fuscater_Great Thrush\nZonotrichia capensis_Rufous-collared Sparrow') }) as unknown as Response);
    });
    await handle({ ...loadRequest, models: [source, second], decisionRule: SINGLE_WINDOW });
    // A model published in parts is joined before the runtime reads it.
    expect(runtime.create).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 1, 2]), expect.anything());
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'MODEL_LOADED', numClasses: 3, modelSizeBytes: loadRequest.modelSizeBytes });
    const logit = (confidence: number): number => Math.log(confidence / (1 - confidence));
    runtime.run
      .mockResolvedValueOnce({ output: { data: new Float32Array([logit(0.5), logit(0.9)]), dispose: runtime.disposeOutput } })
      .mockResolvedValueOnce({ output: { data: new Float32Array([logit(0.7), logit(0.96)]), dispose: runtime.disposeOutput } });
    tensors.created.mockClear();
    await handle(inferRequest);
    // The second model received the window at its own rate.
    expect(tensors.created.mock.calls).toEqual([[AUDIO_CONSTANTS.WINDOW_SAMPLES], [second.windowSamples]]);
    const response = postMessage.mock.lastCall?.[0] as { detections: { scientificName: string; confidence: number }[] };
    // The sparrow both heard: (0.9 + 0.7) / 2. The antpitta only one knows: 0.96 / 2. The thrush: 0.5 / 2, discarded.
    expect(response.detections.map((detection) => detection.scientificName)).toEqual(['Zonotrichia capensis', 'Grallaria ruficapilla']);
    expect(response.detections[0]?.confidence).toBeCloseTo(0.8);
    expect(response.detections[1]?.confidence).toBeCloseTo(0.48);
  });

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
      await handle({ ...loadRequest, capture: { ...capture, windowSamples: 0 } });
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
    await handle({ ...loadRequest, models: [{ ...source, windowSamples }], capture: { ...capture, windowSamples } });
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
    const stored = [{ id: 'stored-detection' }];
    let commit: (() => void) | undefined;
    persistence.save.mockReturnValueOnce(new Promise<typeof stored>((resolve) => { commit = () => { resolve(stored); }; }));
    const pending = handle({ ...inferRequest, persistence: { recordedAt: '2026-10-06T12:00:00Z', location: null, modelVersion: 'test-model' } });
    await vi.waitFor(() => { expect(persistence.save).toHaveBeenCalled(); });
    expect(postMessage).not.toHaveBeenCalled();
    commit?.();
    await pending;
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'INFERENCE_RESULT' }));
    // The clips are kept from what was actually stored, with the audio of that window.
    expect(persistence.keepClips).toHaveBeenCalledWith(stored, expect.any(Float32Array));
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
