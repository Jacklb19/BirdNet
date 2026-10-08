import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioCapture } from './useAudioCapture';
import { AudioCaptureService, type AudioCaptureCallbacks } from '../services/audioCaptureService';
import { InferenceService, type InferenceCallbacks } from '../../inference/inference.service';
import type { ModelManifest, ModelStatus } from '../../inference/inference.types';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from '../../inference/inference.constants';
import { formatModelVersion } from '../../inference/modelManifest';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';

vi.mock('../services/audioCaptureService');
vi.mock('../../inference/inference.service');

describe('useAudioCapture listening session', () => {
  let captureCallbacks: AudioCaptureCallbacks;
  let inferenceCallbacks: InferenceCallbacks;
  let status: ModelStatus;
  let manifest: ModelManifest | null;
  const start = vi.fn();
  const stop = vi.fn();
  const infer = vi.fn();
  const dispose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    status = 'idle';
    manifest = null;
    start.mockImplementation(() => {
      captureCallbacks.onStateChange?.('listening');
      return Promise.resolve();
    });
    stop.mockImplementation(() => {
      captureCallbacks.onStateChange?.('idle');
      return Promise.resolve();
    });
    dispose.mockImplementation(() => { status = 'idle'; inferenceCallbacks.onStatusChange?.('idle'); });
    vi.mocked(AudioCaptureService).mockImplementation(function (this: AudioCaptureService, callbacks) {
      captureCallbacks = callbacks ?? {};
      this.start = start;
      this.stop = stop;
    });
    vi.mocked(InferenceService).mockImplementation(function (this: InferenceService, callbacks) {
      inferenceCallbacks = callbacks ?? {};
      this.loadModel = vi.fn(() => { status = 'loading'; callbacks?.onStatusChange?.('loading'); return Promise.resolve(); });
      this.getStatus = () => status;
      this.getManifest = () => manifest;
      this.infer = infer;
      this.dispose = dispose;
    });
  });

  afterEach(() => { vi.restoreAllMocks(); });

  async function ready(): Promise<void> {
    await act(async () => {
      status = 'ready';
      inferenceCallbacks.onStatusChange?.('ready');
      inferenceCallbacks.onModelLoaded?.(6522);
      await Promise.resolve();
    });
  }

  it('starts idle and starts capture only after the model is ready', async () => {
    const { result } = renderHook(() => useAudioCapture());
    expect(result.current.detections).toEqual([]);
    expect(result.current.state).toBe('idle');
    await act(async () => { await result.current.startListening(); await result.current.startListening(); });
    expect(result.current.modelStatus).toBe('loading');
    expect(start).not.toHaveBeenCalled();
    await ready();
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('listening');
  });

  it('routes live windows to inference and applies the policy with latency metrics', async () => {
    const { result } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); });
    await ready();
    const buffer = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    act(() => {
      captureCallbacks.onLevelUpdate?.(0.4, 0.6);
      captureCallbacks.onWindowReady?.(buffer, 7, 100);
      captureCallbacks.onWindowsDropped?.(2);
      inferenceCallbacks.onWindowDropped?.();
      captureCallbacks.onMelSpectrogramReady?.({
        type: 'MEL_SPECTROGRAM_READY', data: new Float32Array(1), numFrames: 1,
        numMelBands: 1, windowIndex: 7, durationMs: 12, timestamp: 100,
      });
      inferenceCallbacks.onInferenceResult?.([0.2, 0.45, 0.8].map((confidence, classIndex) => ({
        classIndex, confidence, label: 'Turdus fuscater_Great Thrush',
        scientificName: 'Turdus fuscater', commonName: 'Great Thrush',
      })), 7, 100, 30, 45, null);
    });
    expect(infer).toHaveBeenCalledWith(buffer, 7, 100, TOP_K, MIN_CANDIDATE_CONFIDENCE, undefined);
    expect(result.current.detections.map((item) => item.status)).toEqual(['provisional', 'confirmed_local']);
    expect(result.current.inferenceLatencyMs).toBe(30);
    expect(result.current.endToEndLatencyMs).toBe(45);
    expect(result.current.droppedWindows).toBe(3);
    expect(result.current.windowCount).toBe(1);
    expect(result.current.spectrogramLatencyMs).toBe(12);
    await act(async () => { await result.current.stopListening(); });
    expect(result.current.rmsLevel).toBe(0);
    expect(result.current.peakLevel).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('stores windows with the version of the model that classified them', async () => {
    manifest = {
      model_id: 'birdnet', variant: 'fp32', sha256: 'a'.repeat(64), sample_rate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
      window_samples: AUDIO_CONSTANTS.WINDOW_SAMPLES, window_seconds: AUDIO_CONSTANTS.WINDOW_DURATION_SEC,
      num_classes: 1, size_bytes: 1, labels_file: 'labels.txt', model_file: 'model.onnx', updated_at: '2026-10-07',
    };
    const { result } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); });
    await ready();
    const buffer = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    act(() => { captureCallbacks.onWindowReady?.(buffer, 2, 100); });
    expect(infer).toHaveBeenCalledWith(buffer, 2, 100, TOP_K, MIN_CANDIDATE_CONFIDENCE, expect.objectContaining({
      location: null, modelVersion: formatModelVersion(manifest),
    }));
  });

  it('ignores late model and inference callbacks after stop or unmount', async () => {
    const { result, unmount } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); await result.current.stopListening(); });
    await ready();
    expect(start).not.toHaveBeenCalled();
    act(() => {
      captureCallbacks.onWindowReady?.(new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES), 1, 100);
      inferenceCallbacks.onInferenceResult?.([], 1, 100, 10, 20, null);
    });
    expect(infer).not.toHaveBeenCalled();
    expect(result.current.endToEndLatencyMs).toBe(0);
    unmount();
    await ready();
    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('handles denied microphone permission and permits retry', async () => {
    start.mockRejectedValueOnce(new Error('Permission denied'));
    const { result } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); });
    await ready();
    expect(result.current.sessionError).toBe('audio');
    await act(async () => { await result.current.startListening(); });
    await ready();
    expect(result.current.sessionError).toBeNull();
    expect(result.current.state).toBe('listening');
  });

  it.each(['error', 'ready'] as const)('stops resources after an inference failure in state %s', async (modelStatus) => {
    const { result } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); });
    await act(async () => {
      status = modelStatus;
      inferenceCallbacks.onError?.('Worker failed');
      await Promise.resolve();
    });
    expect(result.current.sessionError).toBe(modelStatus === 'error' ? 'model' : 'inference');
    expect(dispose).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('reports malformed predictions and DSP errors explicitly', async () => {
    const { result } = renderHook(() => useAudioCapture());
    await act(async () => { await result.current.startListening(); });
    await ready();
    act(() => {
      inferenceCallbacks.onInferenceResult?.([{
        classIndex: 0, confidence: NaN, label: '', scientificName: '', commonName: '',
      }], 0, 0, 0, 0, null);
    });
    expect(result.current.sessionError).toBe('inference');
    await act(async () => { await result.current.startListening(); });
    act(() => { captureCallbacks.onError?.(new Error('DSP failed')); });
    expect(result.current.sessionError).toBe('audio');
  });
});
