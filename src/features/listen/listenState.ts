import type { LocalDetectionStatus } from '../inference/detectionPolicy';
import type { ModelState } from '../offline/useModel';
import type { ListeningContextValue } from './listeningContext';

/** Where the session is, as the screen explains it. */
export type SessionPhase = 'idle' | 'preparingModel' | 'waitingMicrophone' | 'listening' | 'error';

export function sessionPhase(session: Pick<ListeningContextValue, 'active' | 'sessionError' | 'modelStatus' | 'captureState'>): SessionPhase {
  if (session.sessionError !== null) return 'error';
  if (!session.active) return 'idle';
  if (session.captureState === 'listening') return 'listening';
  // The microphone is requested only once the model has loaded.
  return session.modelStatus === 'ready' ? 'waitingMicrophone' : 'preparingModel';
}

/**
 * What the species area shows: nothing to list yet, waiting for the first song, the live list, or the species
 * of the session that just ended (kept until the next start).
 */
export type ListPhase = 'hidden' | 'waiting' | 'live' | 'last';

export function listPhase(active: boolean, speciesCount: number): ListPhase {
  if (active) return speciesCount > 0 ? 'live' : 'waiting';
  return speciesCount > 0 ? 'last' : 'hidden';
}

export const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** When a species was last heard, in the coarse units a field list needs. */
export type HeardAgo =
  | { readonly unit: 'now' }
  | { readonly unit: 'moment' }
  | { readonly unit: 'minutes'; readonly value: number }
  | { readonly unit: 'hours'; readonly value: number };

/** `now` may lag a little behind the latest window, so a future `lastHeard` reads as a moment ago. */
export function heardAgo(lastHeard: number, now: number, singingNow: boolean): HeardAgo {
  if (singingNow) return { unit: 'now' };
  const minutes = Math.floor(Math.max(0, now - lastHeard) / MS_PER_MINUTE);
  if (minutes < 1) return { unit: 'moment' };
  if (minutes < MINUTES_PER_HOUR) return { unit: 'minutes', value: minutes };
  return { unit: 'hours', value: Math.floor(minutes / MINUTES_PER_HOUR) };
}

/** Why listening cannot start yet, as the record button explains it. */
export type StartBlocker = 'checking' | 'downloading' | 'needsModel';

/**
 * Listening can start when the model is on the device, when the build loads it from the server
 * ('unmanaged'), or after a failed check (the session then reports exactly what is missing).
 */
export function startBlocker(model: ModelState): StartBlocker | null {
  switch (model) {
    case 'checking': return 'checking';
    case 'downloading': return 'downloading';
    case 'missing': return 'needsModel';
    case 'ready':
    case 'unmanaged':
    case 'error': return null;
  }
}

/**
 * A session that failed on the model repeats what the model notice already explains while the model is
 * missing or its check failed, so only one of them is shown.
 */
export function showsSessionError(error: ListeningContextValue['sessionError'], model: ModelState): boolean {
  if (error === null) return false;
  return !(error === 'model' && (model === 'missing' || model === 'error'));
}

/** Local states use the shared verification vocabulary on screen. */
export function displayStatus(status: LocalDetectionStatus): 'confirmed' | 'provisional' {
  return status === 'confirmed_local' ? 'confirmed' : 'provisional';
}
