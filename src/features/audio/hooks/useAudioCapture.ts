import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AudioCaptureService,
  type AudioCaptureState,
} from '../services/audioCaptureService';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.worker';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';

export interface UseAudioCaptureReturn {
  estado: AudioCaptureState;
  error: string | null;
  nivelRms: number;
  nivelPico: number;
  conteoVentanas: number;
  ultimoEspectrograma: MelSpectrogramResponse | null;
  latenciaUltimoEspectrogramaMs: number;
  sampleRate: number;
  iniciarEscucha: () => Promise<void>;
  detenerEscucha: () => Promise<void>;
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [estado, setEstado] = useState<AudioCaptureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [nivelRms, setNivelRms] = useState<number>(0);
  const [nivelPico, setNivelPico] = useState<number>(0);
  const [conteoVentanas, setConteoVentanas] = useState<number>(0);
  const [ultimoEspectrograma, setUltimoEspectrograma] =
    useState<MelSpectrogramResponse | null>(null);
  const [latenciaUltimoEspectrogramaMs, setLatenciaUltimoEspectrogramaMs] =
    useState<number>(0);

  const serviceRef = useRef<AudioCaptureService | null>(null);

  useEffect(() => {
    const service = new AudioCaptureService({
      onStateChange: (nuevoEstado): void => {
        setEstado(nuevoEstado);
      },
      onLevelUpdate: (rms, peak): void => {
        setNivelRms(rms);
        setNivelPico(peak);
      },
      onWindowReady: (): void => {
        setConteoVentanas((prev) => prev + 1);
      },
      onMelSpectrogramReady: (response): void => {
        setUltimoEspectrograma(response);
        setLatenciaUltimoEspectrogramaMs(Math.round(response.durationMs));
      },
      onError: (err): void => {
        setError(err.message);
      },
    });

    serviceRef.current = service;

    return (): void => {
      void service.stop();
    };
  }, []);

  const iniciarEscucha = useCallback(async (): Promise<void> => {
    setError(null);
    if (serviceRef.current) {
      await serviceRef.current.start();
    }
  }, []);

  const detenerEscucha = useCallback(async (): Promise<void> => {
    if (serviceRef.current) {
      await serviceRef.current.stop();
    }
    setNivelRms(0);
    setNivelPico(0);
  }, []);

  return {
    estado,
    error,
    nivelRms,
    nivelPico,
    conteoVentanas,
    ultimoEspectrograma,
    latenciaUltimoEspectrogramaMs,
    sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    iniciarEscucha,
    detenerEscucha,
  };
}
