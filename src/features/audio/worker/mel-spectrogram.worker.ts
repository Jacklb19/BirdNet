import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import {
  createMelFilterbank,
  computeMelSpectrogram,
  DEFAULT_MEL_FILTERBANK,
  type MelFilterbankConfig,
} from '../dsp/mel';
import {
  MEL_WORKER_MESSAGES,
  type MelSpectrogramResponse,
  type MelWorkerInboundMessage,
  type MelWorkerOutboundMessage,
} from './mel-spectrogram.protocol';

// Re-exported for modules that already import the message types from the worker.
export type {
  ComputeMelRequest,
  MelErrorMessage,
  MelSpectrogramResponse,
  MelWorkerInboundMessage,
  MelWorkerOutboundMessage,
  ResetRequest,
} from './mel-spectrogram.protocol';

/** Deterministic mel spectrogram pipeline that keeps its filterbank so it is built once per worker. */
export class MelSpectrogramPipeline {
  private readonly filterbank: Float32Array[];
  private readonly sampleRate: number;
  private readonly fftSize: number;
  private readonly hopLength: number;

  constructor(
    config: Partial<MelFilterbankConfig> & { hopLength?: number } = {},
  ) {
    this.sampleRate = config.sampleRate ?? DEFAULT_MEL_FILTERBANK.sampleRate;
    this.fftSize = config.fftSize ?? DEFAULT_MEL_FILTERBANK.fftSize;
    this.hopLength = config.hopLength ?? AUDIO_CONSTANTS.STFT_HOP_LENGTH;

    this.filterbank = createMelFilterbank({
      sampleRate: this.sampleRate,
      fftSize: this.fftSize,
      numMelBands: config.numMelBands ?? DEFAULT_MEL_FILTERBANK.numMelBands,
      minFreqHz: config.minFreqHz ?? DEFAULT_MEL_FILTERBANK.minFreqHz,
      maxFreqHz: config.maxFreqHz ?? DEFAULT_MEL_FILTERBANK.maxFreqHz,
    });
  }

  /** Computes the mel spectrogram of one analysis window and reports how long it took. */
  public processWindow(
    samples: Float32Array,
    windowIndex: number,
    timestamp: number,
  ): MelSpectrogramResponse {
    const startTime = performance.now();

    const result = computeMelSpectrogram(
      samples,
      this.sampleRate,
      this.fftSize,
      this.hopLength,
      this.filterbank,
    );

    const durationMs = performance.now() - startTime;

    return {
      type: MEL_WORKER_MESSAGES.spectrogramReady,
      data: result.data,
      numFrames: result.numFrames,
      numMelBands: result.numMelBands,
      windowIndex,
      durationMs,
      timestamp,
    };
  }
}

// Importing the pipeline in tests must not install a main-thread message handler.
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  const pipeline = new MelSpectrogramPipeline();

  self.onmessage = (event: MessageEvent<MelWorkerInboundMessage>): void => {
    const { data } = event;
    if (data.type === MEL_WORKER_MESSAGES.computeMel) {
      const workerScope = self as unknown as {
        postMessage: (msg: MelWorkerOutboundMessage, transfer?: Transferable[]) => void;
      };
      try {
        const response = pipeline.processWindow(data.buffer, data.windowIndex, data.timestamp);
        workerScope.postMessage(response, [response.data.buffer]);
      } catch (error) {
        workerScope.postMessage({ type: MEL_WORKER_MESSAGES.error, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
}
