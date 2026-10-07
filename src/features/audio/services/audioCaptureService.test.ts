import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioCaptureError, AudioCaptureService } from './audioCaptureService';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import { AUDIO_WINDOW_PROCESSOR_OPTIONS } from '../worklet/audio-window-processor';

describe('AudioCaptureService', () => {
  let service: AudioCaptureService;
  const mockTrack = { stop: vi.fn() };
  const mockStream = {
    getTracks: vi.fn(() => [mockTrack]),
  };

  const mockPort = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };

  const mockSourceNode = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockWorkletNode = {
    port: mockPort,
    connect: vi.fn(),
    disconnect: vi.fn(),
    onprocessorerror: null as (() => void) | null,
  };
  const mockMelWorker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };

  let getUserMedia: ReturnType<typeof vi.fn>;
  let mockAudioContextInstance: {
    state: string;
    currentTime: number;
    audioWorklet: { addModule: ReturnType<typeof vi.fn> };
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMelWorker.onmessage = null;
    vi.stubGlobal('Worker', vi.fn(function () { return mockMelWorker; }));

    mockAudioContextInstance = {
      state: 'suspended',
      currentTime: 1000,
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createMediaStreamSource: vi.fn().mockReturnValue(mockSourceNode),
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    globalThis.AudioContext = vi.fn(function () {
      return mockAudioContextInstance;
    }) as unknown as typeof AudioContext;
    globalThis.AudioWorkletNode = vi.fn(function () {
      return mockWorkletNode;
    }) as unknown as typeof AudioWorkletNode;

    getUserMedia = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia },
      writable: true,
      configurable: true,
    });

    service = new AudioCaptureService();
  });

  afterEach(async () => {
    await service.stop();
    vi.unstubAllGlobals();
  });

  it('starts idle', () => {
    expect(service.getState()).toBe('idle');
  });

  it('starts capture and moves to listening', async () => {
    const onStateChange = vi.fn();
    service.setCallbacks({ onStateChange });

    await service.start();

    expect(service.getState()).toBe('listening');
    expect(onStateChange).toHaveBeenCalledWith('requesting_permission');
    expect(onStateChange).toHaveBeenCalledWith('listening');
    expect(mockAudioContextInstance.resume).toHaveBeenCalled();
  });

  it('loads the worklet from a same-origin file that the CSP script-src allows', async () => {
    await service.start();

    const [url] = mockAudioContextInstance.audioWorklet.addModule.mock.calls[0] as [string];
    expect(url).not.toMatch(/^(blob|data):/);
    expect(url).toMatch(/audio-window-processor\.worklet.*\.js/);
  });

  it('opens the microphone and worklet with the shared audio parameters', async () => {
    await service.start();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: AUDIO_CONSTANTS.CAPTURE_CONSTRAINTS });
    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE });
    expect(AudioWorkletNode).toHaveBeenCalledWith(mockAudioContextInstance, AUDIO_CONSTANTS.WORKLET_PROCESSOR_NAME, {
      processorOptions: AUDIO_WINDOW_PROCESSOR_OPTIONS,
    });
  });

  it('reports a processor failure, such as rejected options, and releases resources', async () => {
    const onError = vi.fn();
    service.setCallbacks({ onError });
    await service.start();
    mockWorkletNode.onprocessorerror?.();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'window_processor_failed' }));
    await vi.waitFor(() => { expect(service.getState()).toBe('idle'); });
  });

  it('reports a typed error when the MediaDevices API is missing', async () => {
    Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
    await expect(service.start()).rejects.toBeInstanceOf(AudioCaptureError);
    expect(service.getState()).toBe('error');
  });

  it('does not start twice while listening', async () => {
    await service.start();
    await service.start();
    expect(service.getState()).toBe('listening');
  });

  it('handles LEVEL_UPDATE and WINDOW_READY messages from the worklet', async () => {
    const onLevelUpdate = vi.fn();
    const onWindowReady = vi.fn();
    const onMelSpectrogramReady = vi.fn();

    service.setCallbacks({
      onLevelUpdate,
      onWindowReady,
      onMelSpectrogramReady,
    });

    await service.start();

    expect(mockPort.onmessage).not.toBeNull();

    mockPort.onmessage?.({
      data: { type: 'LEVEL_UPDATE', rms: 0.12, peak: 0.45 },
    } as MessageEvent);

    expect(onLevelUpdate).toHaveBeenCalledWith(0.12, 0.45);

    const testBuffer = new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    mockPort.onmessage?.({
      data: {
        type: 'WINDOW_READY',
        buffer: testBuffer,
        windowIndex: 1,
        timestamp: 1000,
      },
    } as MessageEvent);

    expect(onWindowReady).toHaveBeenCalledWith(testBuffer, 1, expect.any(Number));
    expect(onMelSpectrogramReady).not.toHaveBeenCalled();
    expect(mockMelWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMPUTE_MEL', windowIndex: 1 }),
      [expect.any(ArrayBuffer)],
    );
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'WINDOW_ACK' });
    mockMelWorker.onmessage?.({ data: { type: 'MEL_SPECTROGRAM_READY', data: new Float32Array(1) } } as MessageEvent);
    expect(onMelSpectrogramReady).toHaveBeenCalled();
  });

  it('releases resources and returns to idle on stop()', async () => {
    await service.start();
    await service.stop();

    expect(service.getState()).toBe('idle');
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockSourceNode.disconnect).toHaveBeenCalled();
    expect(mockWorkletNode.disconnect).toHaveBeenCalled();
    expect(mockAudioContextInstance.close).toHaveBeenCalled();
  });

  it('moves to error when getUserMedia fails', async () => {
    const onError = vi.fn();
    service.setCallbacks({ onError });

    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValueOnce(
      new Error('Permission denied'),
    );

    await expect(service.start()).rejects.toThrow('Permission denied');
    expect(service.getState()).toBe('error');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('bounds spectrogram work and preserves pending buffers transferred to inference', async () => {
    const onWindowReady = vi.fn((buffer: Float32Array) => {
      structuredClone(buffer, { transfer: [buffer.buffer] });
    });
    service.setCallbacks({ onWindowReady });
    await service.start();
    for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
      mockPort.onmessage?.({ data: {
        type: 'WINDOW_READY', buffer: new Float32Array(AUDIO_CONSTANTS.WINDOW_SAMPLES).fill(windowIndex), windowIndex, timestamp: 1000,
      } } as MessageEvent);
    }
    expect(mockMelWorker.postMessage).toHaveBeenCalledTimes(1);
    mockMelWorker.onmessage?.({ data: { type: 'MEL_SPECTROGRAM_READY' } } as MessageEvent);
    const sent = mockMelWorker.postMessage.mock.calls[1]?.[0] as { buffer: Float32Array; windowIndex: number };
    expect(sent.windowIndex).toBe(3);
    expect(sent.buffer.length).toBe(AUDIO_CONSTANTS.WINDOW_SAMPLES);
    expect(sent.buffer[0]).toBe(3);
  });

  it('releases a late microphone permission after stop', async () => {
    let grant: ((stream: MediaStream) => void) | undefined;
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockReturnValueOnce(new Promise((resolve) => { grant = resolve; }));
    const starting = service.start();
    await service.stop();
    grant?.(mockStream as unknown as MediaStream);
    await starting;
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(service.getState()).toBe('idle');
    expect(mockMelWorker.postMessage).not.toHaveBeenCalled();
  });

  it('reports worker failures without executing DSP on the main thread', async () => {
    const onError = vi.fn();
    service.setCallbacks({ onError });
    await service.start();
    mockMelWorker.onmessage?.({ data: { type: 'MEL_ERROR', error: 'Invalid audio' } } as MessageEvent);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid audio' }));
    mockMelWorker.onerror?.();
    await vi.waitFor(() => { expect(mockMelWorker.terminate).toHaveBeenCalled(); });
  });
});
