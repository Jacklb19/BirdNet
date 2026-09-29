import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioCapture } from './useAudioCapture';
import { AudioCaptureService } from '../services/audioCaptureService';

vi.mock('../services/audioCaptureService');

describe('useAudioCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('se inicializa en estado idle con niveles en cero', () => {
    const { result } = renderHook(() => useAudioCapture());

    expect(result.current.estado).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.nivelRms).toBe(0);
    expect(result.current.nivelPico).toBe(0);
    expect(result.current.conteoVentanas).toBe(0);
    expect(result.current.ultimoEspectrograma).toBeNull();
  });

  it('llama a service.start al invocar iniciarEscucha', async () => {
    const startMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(AudioCaptureService).mockImplementation(function (
      this: AudioCaptureService,
      callbacks,
    ) {
      this.start = startMock.mockImplementation(() => {
        callbacks?.onStateChange?.('escuchando');
        return Promise.resolve();
      });
      this.stop = vi.fn().mockResolvedValue(undefined);
      this.getState = vi.fn().mockReturnValue('idle');
      this.setCallbacks = vi.fn();
    });

    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.iniciarEscucha();
    });

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('escuchando');
  });

  it('llama a service.stop y restablece niveles al invocar detenerEscucha', async () => {
    const stopMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(AudioCaptureService).mockImplementation(function (
      this: AudioCaptureService,
      callbacks,
    ) {
      this.start = vi.fn().mockImplementation(() => {
        callbacks?.onStateChange?.('escuchando');
        callbacks?.onLevelUpdate?.(0.4, 0.6);
        return Promise.resolve();
      });
      this.stop = stopMock.mockImplementation(() => {
        callbacks?.onStateChange?.('idle');
        return Promise.resolve();
      });
      this.getState = vi.fn().mockReturnValue('idle');
      this.setCallbacks = vi.fn();
    });

    const { result } = renderHook(() => useAudioCapture());

    await act(async () => {
      await result.current.iniciarEscucha();
    });

    expect(result.current.estado).toBe('escuchando');
    expect(result.current.nivelRms).toBe(0.4);

    await act(async () => {
      await result.current.detenerEscucha();
    });

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(result.current.nivelRms).toBe(0);
    expect(result.current.nivelPico).toBe(0);
    expect(result.current.estado).toBe('idle');
  });
});
