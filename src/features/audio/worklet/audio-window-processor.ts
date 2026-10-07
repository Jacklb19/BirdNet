import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import { normalizeAudio } from '../dsp/normalize';
import { StreamingResampler } from '../dsp/resample';

export interface AudioWindowMessage {
  type: 'WINDOW_READY';
  buffer: Float32Array;
  windowIndex: number;
  timestamp: number;
  sampleRate: number;
  droppedWindows?: number;
}

export interface AudioLevelMessage {
  type: 'LEVEL_UPDATE';
  rms: number;
  peak: number;
}

export type WorkletOutboundMessage = AudioWindowMessage | AudioLevelMessage;

/**
 * Lógica pura del buffer de acumulación y ventaneo continuo.
 * Permite ejecutar y probar la lógica de ventaneo independientemente
 * del entorno de AudioWorkletGlobalScope.
 */
export class AudioWindowAccumulator {
  private readonly targetSampleRate: number;
  private readonly windowSamples: number;
  private readonly hopSamples: number;
  private readonly sourceSampleRate: number;
  private readonly resampler: StreamingResampler | null = null;

  private ringBuffer: Float32Array;
  private samplesAccumulatedTotal: number = 0;
  private samplesSinceLastWindow: number = 0;
  private windowIndex: number = 0;

  // Medición de nivel periódica
  private levelSampleCount: number = 0;
  private levelSumSquares: number = 0;
  private levelPeak: number = 0;
  private readonly levelReportIntervalSamples: number;

  constructor(
    sourceSampleRate: number = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    targetSampleRate: number = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    windowSamples: number = AUDIO_CONSTANTS.WINDOW_SAMPLES,
    hopSamples: number = AUDIO_CONSTANTS.HOP_SAMPLES,
  ) {
    this.sourceSampleRate = sourceSampleRate;
    this.targetSampleRate = targetSampleRate;
    this.windowSamples = windowSamples;
    this.hopSamples = hopSamples;
    this.ringBuffer = new Float32Array(this.windowSamples);

    if (this.sourceSampleRate !== this.targetSampleRate) {
      this.resampler = new StreamingResampler(this.sourceSampleRate, this.targetSampleRate);
    }

    // Reportar nivel aproximadamente cada 100 ms
    this.levelReportIntervalSamples = Math.floor(sourceSampleRate * 0.1);
  }

  /**
   * Procesa un bloque de entrada (típicamente 128 muestras de AudioWorklet).
   * Devuelve una ventana de audio si se completó el desplazamiento (hop), o null en caso contrario.
   */
  public processChunk(
    chunk: Float32Array,
  ): { window: Float32Array; index: number } | null {
    if (chunk.length === 0) {
      return null;
    }

    // Actualizar métricas de nivel (sobre el audio crudo de entrada)
    for (let i = 0; i < chunk.length; i++) {
      const sample = chunk[i] ?? 0;
      const abs = Math.abs(sample);
      if (abs > this.levelPeak) {
        this.levelPeak = abs;
      }
      this.levelSumSquares += sample * sample;
    }
    this.levelSampleCount += chunk.length;

    // Remuestrear en streaming si la frecuencia de entrada no coincide con la objetivo (RF-03)
    const processedChunk = this.resampler ? this.resampler.processChunk(chunk) : chunk;
    const chunkLen = processedChunk.length;
    if (chunkLen === 0) {
      return null;
    }

    // Desplazar muestras en el ring buffer hacia la izquierda si se supera el tamaño
    if (chunkLen >= this.windowSamples) {
      // Chunk mayor que la ventana: tomar las últimas windowSamples
      this.ringBuffer.set(processedChunk.subarray(chunkLen - this.windowSamples));
    } else {
      // Desplazar ringBuffer chunkLen posiciones hacia la izquierda
      this.ringBuffer.copyWithin(0, chunkLen);
      // Insertar el nuevo chunk al final
      this.ringBuffer.set(processedChunk, this.windowSamples - chunkLen);
    }

    this.samplesAccumulatedTotal += chunkLen;
    this.samplesSinceLastWindow += chunkLen;

    // Verificar si se alcanzó la primera ventana completa o el siguiente paso (hop)
    const canEmitFirstWindow =
      this.windowIndex === 0 && this.samplesAccumulatedTotal >= this.windowSamples;
    const canEmitSubsequentWindow =
      this.windowIndex > 0 && this.samplesSinceLastWindow >= this.hopSamples;

    if (canEmitFirstWindow || canEmitSubsequentWindow) {
      const emittedWindow = new Float32Array(this.windowSamples);
      emittedWindow.set(this.ringBuffer);

      // Normalizar la señal antes de entregarla al Worker de inferencia (RF-03)
      normalizeAudio(emittedWindow, 0.95, true);

      const currentIndex = this.windowIndex;
      this.windowIndex++;
      // Preserve the fractional audio block remainder to avoid drifting away from the 1.5 s hop.
      this.samplesSinceLastWindow = canEmitFirstWindow
        ? this.samplesAccumulatedTotal - this.windowSamples
        : this.samplesSinceLastWindow - this.hopSamples;

      return { window: emittedWindow, index: currentIndex };
    }

    return null;
  }

  /**
   * Extrae y reinicia las métricas acumuladas de nivel RMS y pico si se alcanzó el intervalo.
   */
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
