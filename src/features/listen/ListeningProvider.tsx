import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAudioCapture } from '../audio/hooks/useAudioCapture';
import type { ClassifiedDetection } from '../inference/detectionPolicy';
import { mergeSession, type SessionSpecies } from './session';
import {
  ListeningContext, ListeningSignalContext, type ListeningContextValue, type ListeningSignalValue,
} from './listeningContext';

/** Owns the one listening session of the app; screens read it through useListening() / useListeningSignal(). */
export function ListeningProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const [species, setSpecies] = useState<readonly SessionSpecies[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // Every analysed window, including silent ones, refreshes who is singing now.
  const onWindowAnalysed = useCallback((detections: readonly ClassifiedDetection[], analysedAt: number): void => {
    setSpecies((previous) => mergeSession(previous, detections, analysedAt));
  }, []);

  const {
    state: captureState, modelStatus, sessionError, regionSpecies, startListening, stopListening,
    rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs,
  } = useAudioCapture({ onWindowAnalysed });

  const start = useCallback(async (): Promise<void> => {
    setSpecies([]);
    setStartedAt(Date.now());
    await startListening();
  }, [startListening]);

  const stop = useCallback(async (): Promise<void> => {
    setStartedAt(null);
    await stopListening();
  }, [stopListening]);

  // A failed session is over: the timer and the live player stop with it (the error stays visible).
  const active = startedAt !== null && sessionError === null;

  const session = useMemo<ListeningContextValue>(() => ({
    captureState,
    modelStatus,
    sessionError,
    regionSpecies,
    species,
    singing: active ? species.find((row) => row.singingNow) ?? null : null,
    startedAt: active ? startedAt : null,
    active,
    start,
    stop,
  }), [captureState, modelStatus, sessionError, regionSpecies, species, active, startedAt, start, stop]);

  const signal = useMemo<ListeningSignalValue>(() => ({
    rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs,
  }), [rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs]);

  return (
    <ListeningContext value={session}>
      <ListeningSignalContext value={signal}>{children}</ListeningSignalContext>
    </ListeningContext>
  );
}
