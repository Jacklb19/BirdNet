/**
 * Messages between the capture service and the spectrogram worker. Kept apart from the worker so the main
 * thread can use the wire names without bundling the DSP code the worker runs.
 */

/** Wire names of the spectrogram worker messages. */
export const MEL_WORKER_MESSAGES = Object.freeze({
  computeMel: 'COMPUTE_MEL',
  reset: 'RESET',
  spectrogramReady: 'MEL_SPECTROGRAM_READY',
  error: 'MEL_ERROR',
} as const);

export interface ComputeMelRequest {
  type: typeof MEL_WORKER_MESSAGES.computeMel;
  buffer: Float32Array;
  windowIndex: number;
  timestamp: number;
}

export interface MelSpectrogramResponse {
  type: typeof MEL_WORKER_MESSAGES.spectrogramReady;
  /** Row-major matrix [numFrames, numMelBands] in decibels. */
  data: Float32Array;
  numFrames: number;
  numMelBands: number;
  windowIndex: number;
  durationMs: number;
  timestamp: number;
}

export interface ResetRequest {
  type: typeof MEL_WORKER_MESSAGES.reset;
}

export interface MelErrorMessage {
  type: typeof MEL_WORKER_MESSAGES.error;
  error: string;
}

export type MelWorkerInboundMessage = ComputeMelRequest | ResetRequest;
export type MelWorkerOutboundMessage = MelSpectrogramResponse | MelErrorMessage;
