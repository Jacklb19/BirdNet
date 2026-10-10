import { createContext, useContext } from 'react';
import type { UseAudioCaptureReturn } from '../audio/hooks/useAudioCapture';
import type { SessionSpecies } from './session';

/** How a session runs: listening in place, or on a walk with the screen kept on and the path drawn (ADR-25). */
export type ListeningMode = 'listen' | 'walk';

/** Session state that changes at most once per analysed window; safe for the shell and any screen. */
export interface ListeningContextValue {
  readonly captureState: UseAudioCaptureReturn['state'];
  readonly modelStatus: UseAudioCaptureReturn['modelStatus'];
  readonly sessionError: UseAudioCaptureReturn['sessionError'];
  /** Species the geographic model considers likely here this week; null when the place is unknown (nothing filtered). */
  readonly regionSpecies: number | null;
  /** Species heard in this session, current singers first. */
  readonly species: readonly SessionSpecies[];
  /** The species singing in the latest analysed window, if any. */
  readonly singing: SessionSpecies | null;
  /** Epoch milliseconds when the current session started; null when idle. */
  readonly startedAt: number | null;
  /** True from the moment the person presses start until they stop or an error ends the session. */
  readonly active: boolean;
  /** The active session is a walk. It ends with the session, however that happens. */
  readonly walking: boolean;
  readonly start: (mode?: ListeningMode) => Promise<void>;
  readonly stop: () => Promise<void>;
}

/**
 * Signal data refreshed many times per second (input level, spectrogram, latencies). Kept in its own
 * context so only the components that draw it re-render while listening.
 */
export type ListeningSignalValue = Pick<UseAudioCaptureReturn,
  'rmsLevel' | 'peakLevel' | 'latestSpectrogram' | 'sampleRate' | 'windowCount' | 'droppedWindows' |
  'spectrogramLatencyMs' | 'inferenceLatencyMs' | 'endToEndLatencyMs'>;

export const ListeningContext = createContext<ListeningContextValue | null>(null);
export const ListeningSignalContext = createContext<ListeningSignalValue | null>(null);

/** Listening lives above the router so it keeps running while the person browses other sections. */
export function useListening(): ListeningContextValue {
  const value = useContext(ListeningContext);
  if (!value) throw new Error('useListening must be used inside ListeningProvider.');
  return value;
}

export function useListeningSignal(): ListeningSignalValue {
  const value = useContext(ListeningSignalContext);
  if (!value) throw new Error('useListeningSignal must be used inside ListeningProvider.');
  return value;
}
