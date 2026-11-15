import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { beginOuting, endOuting } from '../journal/outingSession';
import { registerAccountActivity } from '../account/sessionActivity';
import { useAudioCapture } from '../audio/hooks/useAudioCapture';
import type { ClassifiedDetection } from '../inference/detectionPolicy';
import { mergeSession, type SessionSpecies } from './session';
import {
  ListeningContext, ListeningSignalContext, type ListeningContextValue, type ListeningMode, type ListeningSignalValue,
} from './listeningContext';

/** Owns the one listening session of the app; screens read it through useListening() / useListeningSignal(). */
export function ListeningProvider({ children, ownerId }: { readonly children: ReactNode; readonly ownerId: string | null }): React.JSX.Element {
  const [species, setSpecies] = useState<readonly SessionSpecies[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [mode, setMode] = useState<ListeningMode>('listen');
  const starting = useRef(false);
  const [diaryError, setDiaryError] = useState(false);

  // Every analysed window, including silent ones, refreshes who is singing now.
  const onWindowAnalysed = useCallback((detections: readonly ClassifiedDetection[], analysedAt: number): void => {
    setSpecies((previous) => mergeSession(previous, detections, analysedAt));
  }, []);

  const {
    state: captureState, modelStatus, sessionError: captureError, tooSlowForTwo, regionSpecies, startListening, stopListening,
    rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs,
  } = useAudioCapture({ onWindowAnalysed, ownerId });
  const sessionError = diaryError ? 'storage' : captureError;

  const start = useCallback(async (next: ListeningMode = 'listen'): Promise<void> => {
    if (!ownerId || starting.current || (startedAt !== null && sessionError === null)) return;
    starting.current = true; setDiaryError(false);
    try {
      await endOuting(ownerId);
      await beginOuting(ownerId, next === 'walk');
      setSpecies([]); setMode(next); setStartedAt(Date.now());
      await startListening();
    } catch { setDiaryError(true); }
    finally { starting.current = false; }
  }, [startListening, ownerId, startedAt, sessionError]);

  const stop = useCallback(async (): Promise<void> => {
    await stopListening();
    if (ownerId) await endOuting(ownerId);
    setStartedAt(null);
  }, [stopListening, ownerId]);

  useEffect(() => { if (captureError && ownerId) void endOuting(ownerId).catch(() => { setDiaryError(true); }); }, [captureError, ownerId]);

  useEffect(() => registerAccountActivity(stop), [stop]);

  // A failed session is over: the timer and the live player stop with it (the error stays visible).
  const active = startedAt !== null && sessionError === null;

  const session = useMemo<ListeningContextValue>(() => ({
    captureState,
    modelStatus,
    sessionError,
    tooSlowForTwo,
    regionSpecies,
    species,
    singing: active ? species.find((row) => row.singingNow) ?? null : null,
    startedAt: active ? startedAt : null,
    active,
    walking: active && mode === 'walk',
    start,
    stop,
  }), [captureState, modelStatus, sessionError, tooSlowForTwo, regionSpecies, species, active, mode, startedAt, start, stop]);

  const signal = useMemo<ListeningSignalValue>(() => ({
    rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs,
  }), [rmsLevel, peakLevel, latestSpectrogram, sampleRate, windowCount, droppedWindows, spectrogramLatencyMs, inferenceLatencyMs, endToEndLatencyMs]);

  return (
    <ListeningContext value={session}>
      <ListeningSignalContext value={signal}>{children}</ListeningSignalContext>
    </ListeningContext>
  );
}
