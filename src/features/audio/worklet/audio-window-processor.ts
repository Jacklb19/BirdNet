import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import { normalizeAudio } from '../dsp/normalize';
import { StreamingResampler } from '../dsp/resample';

/**
 * Message names of the worklet port protocol. `audio-window-processor.worklet.js` cannot import
 * TypeScript, so it mirrors these names; `audio-window-processor.test.ts` runs it against them.
 */
export const WORKLET_MESSAGE_TYPES = Object.freeze({
  windowReady: 'WINDOW_READY',
  levelUpdate: 'LEVEL_UPDATE',
  windowAck: 'WINDOW_ACK',
} as const);

/** A complete, normalized analysis window at the target sample rate. */
export interface AudioWindowMessage {
  type: typeof WORKLET_MESSAGE_TYPES.windowReady;
  buffer: Float32Array;
  windowIndex: number;
  /** Audio clock time (`currentTime`, seconds) when the window completed. */
  timestamp: number;
  sampleRate: number;
  /** Windows replaced while the previous one was still unacknowledged. */
  droppedWindows?: number;
}

/** Input level of the raw device signal over the last report interval. */
export interface AudioLevelMessage {
  type: typeof WORKLET_MESSAGE_TYPES.levelUpdate;
  rms: number;
  peak: number;
}

/** Sent back for each delivered window; the worklet keeps at most one more window waiting until then. */
export interface WindowAckMessage {
  type: typeof WORKLET_MESSAGE_TYPES.windowAck;
}

export type WorkletOutboundMessage = AudioWindowMessage | AudioLevelMessage;
export type WorkletInboundMessage = WindowAckMessage;

/** Parameters the worklet receives through `AudioWorkletNodeOptions.processorOptions`. */
export interface AudioWindowProcessorOptions {
  /** Output sample rate in Hz; device audio at any other rate is resampled to it. */
  readonly targetSampleRate: number;
  /** Samples per emitted window at the target rate. */
  readonly windowSamples: number;
  /** Samples between consecutive windows at the target rate; at most `windowSamples`. */
  readonly hopSamples: number;
  /** Seconds of device audio between level reports. */
  readonly levelReportIntervalSec: number;
  /** Peak at or below which a window is not amplified. */
  readonly silenceThreshold: number;
  /** Peak of a normalized window (at most full scale, 1). */
  readonly targetPeak: number;
}

/** The processor options the capture service sends, built from `AUDIO_CONSTANTS`. */
export const AUDIO_WINDOW_PROCESSOR_OPTIONS: AudioWindowProcessorOptions = Object.freeze({
  targetSampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
  windowSamples: AUDIO_CONSTANTS.WINDOW_SAMPLES,
  hopSamples: AUDIO_CONSTANTS.HOP_SAMPLES,
  levelReportIntervalSec: AUDIO_CONSTANTS.LEVEL_REPORT_INTERVAL_SEC,
  silenceThreshold: AUDIO_CONSTANTS.SILENCE_THRESHOLD_RMS,
  targetPeak: AUDIO_CONSTANTS.NORMALIZATION_TARGET_PEAK,
});

/**
 * Pure accumulation and windowing logic of the worklet, testable outside AudioWorkletGlobalScope.
 * It takes the same options as the worklet so both follow the same parameters.
 */
export class AudioWindowAccumulator {
  private readonly windowSamples: number;
  private readonly hopSamples: number;
  private readonly targetPeak: number;
  private readonly silenceThreshold: number;
  private readonly resampler: StreamingResampler | null = null;

  private ringBuffer: Float32Array;
  private samplesAccumulatedTotal: number = 0;
  private samplesSinceLastWindow: number = 0;
  private windowIndex: number = 0;

  // Periodic level metering over the raw device signal.
  private levelSampleCount: number = 0;
  private levelSumSquares: number = 0;
  private levelPeak: number = 0;
  private readonly levelReportIntervalSamples: number;

  /**
   * @param sourceSampleRate Device sample rate in Hz (the AudioContext rate).
   * @param options Windowing, metering and normalization parameters.
   */
  constructor(
    sourceSampleRate: number = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    options: AudioWindowProcessorOptions = AUDIO_WINDOW_PROCESSOR_OPTIONS,
  ) {
    this.windowSamples = options.windowSamples;
    this.hopSamples = options.hopSamples;
    this.targetPeak = options.targetPeak;
    this.silenceThreshold = options.silenceThreshold;
    this.ringBuffer = new Float32Array(this.windowSamples);

    if (sourceSampleRate !== options.targetSampleRate) {
      this.resampler = new StreamingResampler(sourceSampleRate, options.targetSampleRate);
    }

    this.levelReportIntervalSamples = Math.floor(sourceSampleRate * options.levelReportIntervalSec);
  }

  /**
   * Processes one input block (normally one render quantum). Returns a window when the first window
   * fills or a further hop completes, otherwise null.
   */
  public processChunk(
    chunk: Float32Array,
  ): { window: Float32Array; index: number } | null {
    if (chunk.length === 0) {
      return null;
    }

    // Level metrics use the raw device signal, before resampling and normalization.
    for (let i = 0; i < chunk.length; i++) {
      const sample = chunk[i] ?? 0;
      const abs = Math.abs(sample);
      if (abs > this.levelPeak) {
        this.levelPeak = abs;
      }
      this.levelSumSquares += sample * sample;
    }
    this.levelSampleCount += chunk.length;

    // Resample in streaming when the device rate differs from the target rate (RF-03).
    const processedChunk = this.resampler ? this.resampler.processChunk(chunk) : chunk;
    const chunkLen = processedChunk.length;
    if (chunkLen === 0) {
      return null;
    }

    if (chunkLen >= this.windowSamples) {
      // A block longer than the window: keep only its last windowSamples.
      this.ringBuffer.set(processedChunk.subarray(chunkLen - this.windowSamples));
    } else {
      // Shift the ring buffer left by the block length and append the block at the end.
      this.ringBuffer.copyWithin(0, chunkLen);
      this.ringBuffer.set(processedChunk, this.windowSamples - chunkLen);
    }

    this.samplesAccumulatedTotal += chunkLen;
    this.samplesSinceLastWindow += chunkLen;

    const canEmitFirstWindow =
      this.windowIndex === 0 && this.samplesAccumulatedTotal >= this.windowSamples;
    const canEmitSubsequentWindow =
      this.windowIndex > 0 && this.samplesSinceLastWindow >= this.hopSamples;

    if (canEmitFirstWindow || canEmitSubsequentWindow) {
      const emittedWindow = new Float32Array(this.windowSamples);
      emittedWindow.set(this.ringBuffer);

      // Normalize before the window reaches the inference worker (RF-03).
      normalizeAudio(emittedWindow, this.targetPeak, true, this.silenceThreshold);

      const currentIndex = this.windowIndex;
      this.windowIndex++;
      // Preserve the fractional audio block remainder to avoid drifting away from the hop.
      this.samplesSinceLastWindow = canEmitFirstWindow
        ? this.samplesAccumulatedTotal - this.windowSamples
        : this.samplesSinceLastWindow - this.hopSamples;

      return { window: emittedWindow, index: currentIndex };
    }

    return null;
  }

  /** Returns and resets the accumulated RMS and peak once a report interval has elapsed. */
  public getLevelMetrics(): { rms: number; peak: number } | null {
    if (this.levelSampleCount >= this.levelReportIntervalSamples && this.levelSampleCount > 0) {
      const rms = Math.sqrt(this.levelSumSquares / this.levelSampleCount);
      const peak = this.levelPeak;

      this.levelSampleCount = 0;
      this.levelSumSquares = 0;
      this.levelPeak = 0;

      return { rms, peak };
    }
    return null;
  }

  public reset(): void {
    this.ringBuffer.fill(0);
    this.samplesAccumulatedTotal = 0;
    this.samplesSinceLastWindow = 0;
    this.windowIndex = 0;
    this.levelSampleCount = 0;
    this.levelSumSquares = 0;
    this.levelPeak = 0;
    this.resampler?.reset();
  }
}
