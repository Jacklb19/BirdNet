import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import {
  createMelFilterbank,
  computeMelSpectrogram,
  type MelFilterbankConfig,
} from '../dsp/mel';

export interface ComputeMelRequest {
  type: 'COMPUTE_MEL';
  buffer: Float32Array;
  windowIndex: number;
  timestamp: number;
}

export interface MelSpectrogramResponse {
  type: 'MEL_SPECTROGRAM_READY';
  data: Float32Array;
  numFrames: number;
  numMelBands: number;
  windowIndex: number;
  durationMs: number;
  timestamp: number;
}

export interface ResetRequest {
  type: 'RESET';
}

export type MelWorkerInboundMessage = ComputeMelRequest | ResetRequest;
export type MelWorkerOutboundMessage = MelSpectrogramResponse;

/**
 * Pipeline determinista reutilizable para el cómputo de mel-espectrograma.
 * Conserva el banco de filtros en memoria para evitar reconstrucciones.
 */
export class MelSpectrogramPipeline {
  private readonly filterbank: Float32Array[];
  private readonly sampleRate: number;
  private readonly fftSize: number;
  private readonly hopLength: number;

  constructor(
    config: Partial<MelFilterbankConfig> & { hopLength?: number } = {},
  ) {
    this.sampleRate = config.sampleRate ?? AUDIO_CONSTANTS.TARGET_SAMPLE_RATE;
    this.fftSize = config.fftSize ?? AUDIO_CONSTANTS.FFT_SIZE;
    this.hopLength = config.hopLength ?? AUDIO_CONSTANTS.STFT_HOP_LENGTH;

    this.filterbank = createMelFilterbank({
      sampleRate: this.sampleRate,
      fftSize: this.fftSize,
      numMelBands: config.numMelBands ?? AUDIO_CONSTANTS.NUM_MEL_BANDS,
      minFreqHz: config.minFreqHz ?? AUDIO_CONSTANTS.MIN_FREQUENCY_HZ,
      maxFreqHz: config.maxFreqHz ?? AUDIO_CONSTANTS.MAX_FREQUENCY_HZ,
    });
  }

  /**
   * Procesa una ventana de audio de 3 s y retorna el mel-espectrograma con latencia de ejecución.
   */
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
      type: 'MEL_SPECTROGRAM_READY',
      data: result.data,
      numFrames: result.numFrames,
      numMelBands: result.numMelBands,
      windowIndex,
      durationMs,
      timestamp,
    };
  }
}

// Configuración del entorno de ejecución Web Worker si estamos en worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  const pipeline = new MelSpectrogramPipeline();

  self.onmessage = (event: MessageEvent<MelWorkerInboundMessage>): void => {
    const { data } = event;
    if (data.type === 'COMPUTE_MEL') {
      const response = pipeline.processWindow(
        data.buffer,
        data.windowIndex,
        data.timestamp,
      );
      const workerScope = self as unknown as {
        postMessage: (msg: unknown, transfer?: Transferable[]) => void;
      };
      workerScope.postMessage(response, [response.data.buffer]);
    }
  };
}
