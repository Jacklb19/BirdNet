import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioCaptureService } from './audioCaptureService';

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
  };

  let mockAudioContextInstance: {
    state: string;
    audioWorklet: { addModule: ReturnType<typeof vi.fn> };
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAudioContextInstance = {
      state: 'suspended',
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
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-worklet');
    globalThis.URL.revokeObjectURL = vi.fn();

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });

    service = new AudioCaptureService();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('inicia en estado idle', () => {
    expect(service.getState()).toBe('idle');
  });

  it('inicia captura y actualiza estado a escuchando', async () => {
    const onStateChange = vi.fn();
    service.setCallbacks({ onStateChange });

    await service.start();

    expect(service.getState()).toBe('escuchando');
    expect(onStateChange).toHaveBeenCalledWith('solicitando_permiso');
    expect(onStateChange).toHaveBeenCalledWith('escuchando');
    expect(mockAudioContextInstance.resume).toHaveBeenCalled();
  });

  it('no vuelve a iniciar si ya está escuchando', async () => {
    await service.start();
    await service.start();
    expect(service.getState()).toBe('escuchando');
  });

  it('procesa mensajes LEVEL_UPDATE y WINDOW_READY desde el worklet', async () => {
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

    // Simular LEVEL_UPDATE
    mockPort.onmessage?.({
      data: { type: 'LEVEL_UPDATE', rms: 0.12, peak: 0.45 },
    } as MessageEvent);

    expect(onLevelUpdate).toHaveBeenCalledWith(0.12, 0.45);

    // Simular WINDOW_READY
    const testBuffer = new Float32Array(144000);
    mockPort.onmessage?.({
      data: {
        type: 'WINDOW_READY',
        buffer: testBuffer,
        windowIndex: 1,
        timestamp: 1000,
      },
    } as MessageEvent);

    expect(onWindowReady).toHaveBeenCalledWith(testBuffer, 1, 1000);
    expect(onMelSpectrogramReady).toHaveBeenCalled();
  });

  it('limpia recursos y pasa a idle al llamar a stop()', async () => {
    await service.start();
    await service.stop();

    expect(service.getState()).toBe('idle');
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockSourceNode.disconnect).toHaveBeenCalled();
    expect(mockWorkletNode.disconnect).toHaveBeenCalled();
    expect(mockAudioContextInstance.close).toHaveBeenCalled();
  });

  it('maneja errores en getUserMedia pasando a estado error', async () => {
    const onError = vi.fn();
    service.setCallbacks({ onError });

    const mediaMock = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
    mediaMock.mockRejectedValueOnce(new Error('Permiso denegado'));

    await expect(service.start()).rejects.toThrow('Permiso denegado');
    expect(service.getState()).toBe('error');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
