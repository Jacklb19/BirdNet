import { useState, useEffect, useRef, useCallback } from 'react';
import { AudioCaptureService, type AudioCaptureState } from '../services/audioCaptureService';
import type { MelSpectrogramResponse } from '../worker/mel-spectrogram.protocol';
import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import { InferenceService } from '../../inference/inference.service';
import { MIN_CANDIDATE_CONFIDENCE, TOP_K } from '../../inference/inference.constants';
import type { ModelStatus } from '../../inference/inference.types';
import { formatModelVersion } from '../../inference/modelManifest';
import { applyDetectionPolicy, type ClassifiedDetection } from '../../inference/detectionPolicy';
import { getSettings } from '../../offline/queueStore';
import { scheduleSynchronization } from '../../offline/offlineClient';
import { dispatchSyncError } from '../../offline/offline.constants';
import type { ApproximateLocation, PersistenceContext } from '../../offline/types';
import { watchApproximateLocation } from '../location';

export interface UseAudioCaptureReturn {
  state: AudioCaptureState;
  rmsLevel: number;
  peakLevel: number;
  windowCount: number;
  latestSpectrogram: MelSpectrogramResponse | null;
  spectrogramLatencyMs: number;
  sampleRate: number;
  modelStatus: ModelStatus;
  detections: readonly ClassifiedDetection[];
  inferenceLatencyMs: number;
  endToEndLatencyMs: number;
  droppedWindows: number;
  /** Species likely at the place and week of the latest window (geographic filter); null when nothing was filtered. */
  regionSpecies: number | null;
  sessionError: 'model' | 'audio' | 'inference' | 'storage' | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export interface UseAudioCaptureOptions {
  /** Called once per analysed window, with the classified detections (possibly none) and the epoch time. */
  readonly onWindowAnalysed?: (detections: readonly ClassifiedDetection[], analysedAt: number) => void;
}

/** Coordinates one listening session; audio and model resources are released on stop/unmount. */
export function useAudioCapture(options: UseAudioCaptureOptions = {}): UseAudioCaptureReturn {
  const [state, setState] = useState<AudioCaptureState>('idle');
  const [rmsLevel, setRmsLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [windowCount, setWindowCount] = useState(0);
  const [latestSpectrogram, setLatestSpectrogram] = useState<MelSpectrogramResponse | null>(null);
  const [spectrogramLatencyMs, setSpectrogramLatencyMs] = useState(0);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [detections, setDetections] = useState<readonly ClassifiedDetection[]>([]);
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState(0);
  const [endToEndLatencyMs, setEndToEndLatencyMs] = useState(0);
  const [droppedWindows, setDroppedWindows] = useState(0);
  const [regionSpecies, setRegionSpecies] = useState<number | null>(null);
  const [sessionError, setSessionError] = useState<UseAudioCaptureReturn['sessionError']>(null);
  const serviceRef = useRef<AudioCaptureService | null>(null);
  const inferenceRef = useRef<InferenceService | null>(null);
  const requestedRef = useRef(false);
  const clearLocationRef = useRef<() => void>(() => undefined);
  // The latest callback is read when a window arrives, so a new function never restarts the session.
  const onWindowAnalysedRef = useRef(options.onWindowAnalysed);
  useEffect(() => { onWindowAnalysedRef.current = options.onWindowAnalysed; }, [options.onWindowAnalysed]);

  useEffect(() => {
    let mounted = true;
    let location: ApproximateLocation | null = null;
    let stopLocationWatch: (() => void) | null = null;
    const clearLocation = (): void => { stopLocationWatch?.(); stopLocationWatch = null; location = null; };
    clearLocationRef.current = clearLocation;
    const isActive = (): boolean => mounted && requestedRef.current;
    const capture = new AudioCaptureService({
      onStateChange: (state) => { if (mounted) setState(state); },
      onLevelUpdate: (rms, peak) => { setRmsLevel(rms); setPeakLevel(peak); },
      onWindowReady: (buffer, windowIndex, timestamp) => {
        if (!requestedRef.current) return;
        const manifest = inference.getManifest();
        // Windows are stored only when the exact model that classified them is known.
        const persistence: PersistenceContext | undefined = manifest ? {
          recordedAt: new Date(performance.timeOrigin + timestamp).toISOString(), location,
          modelVersion: formatModelVersion(manifest),
        } : undefined;
        inference.infer(buffer, windowIndex, timestamp, TOP_K, MIN_CANDIDATE_CONFIDENCE, persistence);
      },
      onWindowsDropped: (count) => { setDroppedWindows((total) => total + count); },
      onMelSpectrogramReady: (response) => {
        setLatestSpectrogram(response);
        setSpectrogramLatencyMs(response.durationMs);
      },
      onError: () => { failSession('audio'); },
    });
    const startCapture = async (): Promise<void> => {
      if (!isActive()) return;
      try {
        if (typeof indexedDB !== 'undefined') {
          const settings = await getSettings();
          if (!isActive()) return;
          if (settings.locationEnabled) stopLocationWatch = watchApproximateLocation((cell) => { location = cell; });
        }
        await capture.start();
      } catch {
        failSession('audio');
      }
    };
    const inference = new InferenceService({
      onStatusChange: (status) => { if (mounted) setModelStatus(status); },
      onModelLoaded: () => { void startCapture(); },
      onInferenceResult: (candidates, _windowIndex, _timestamp, latencyMs, totalMs, likely) => {
        if (!requestedRef.current || !mounted) return;
        try {
          const classified = applyDetectionPolicy(candidates);
          setDetections(classified);
          setWindowCount((count) => count + 1);
          onWindowAnalysedRef.current?.(classified, Date.now());
          setInferenceLatencyMs(latencyMs);
          setEndToEndLatencyMs(totalMs);
          setRegionSpecies(likely);
          void scheduleSynchronization().catch(dispatchSyncError);
        } catch {
          failSession('inference');
        }
      },
      onWindowDropped: () => { setDroppedWindows((total) => total + 1); },
      onStorageError: () => { failSession('storage'); },
      onError: () => {
        failSession(inference.getStatus() === 'error' ? 'model' : 'inference');
      },
    });
    const failSession = (reason: NonNullable<UseAudioCaptureReturn['sessionError']>): void => {
      if (!isActive()) return;
      setSessionError(reason);
      requestedRef.current = false;
      clearLocation();
      inference.dispose();
      void capture.stop();
    };
    serviceRef.current = capture;
    inferenceRef.current = inference;
    return () => {
      mounted = false;
      clearLocation();
      requestedRef.current = false;
      inference.dispose();
      void capture.stop();
      serviceRef.current = null;
      inferenceRef.current = null;
    };
  }, []);

  const startListening = useCallback(async (): Promise<void> => {
    if (requestedRef.current || !inferenceRef.current) return;
    requestedRef.current = true;
    setSessionError(null);
    setDetections([]);
    setWindowCount(0);
    setDroppedWindows(0);
    setInferenceLatencyMs(0);
    setEndToEndLatencyMs(0);
    setLatestSpectrogram(null);
    setSpectrogramLatencyMs(0);
    await inferenceRef.current.loadModel();
  }, []);

  const stopListening = useCallback(async (): Promise<void> => {
    requestedRef.current = false;
    clearLocationRef.current();
    inferenceRef.current?.dispose();
    await serviceRef.current?.stop();
    setRmsLevel(0);
    setPeakLevel(0);
  }, []);

  return {
    state, rmsLevel, peakLevel, windowCount, latestSpectrogram,
    spectrogramLatencyMs, sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    modelStatus, detections, inferenceLatencyMs, endToEndLatencyMs, droppedWindows, regionSpecies,
    sessionError, startListening, stopListening,
  };
}
