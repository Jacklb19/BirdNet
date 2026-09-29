import { AUDIO_CONSTANTS } from '../dsp/audio.constants';
import { normalizeAudio } from '../dsp/normalize';
import { resampleAudio } from '../dsp/resample';

export interface AudioWindowMessage {
  type: 'WINDOW_READY';
  buffer: Float32Array;
  windowIndex: number;
  timestamp: number;
  sampleRate: number;
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

    // Actualizar métricas de nivel
    for (let i = 0; i < chunk.length; i++) {
      const sample = chunk[i] ?? 0;
      const abs = Math.abs(sample);
      if (abs > this.levelPeak) {
        this.levelPeak = abs;
      }
      this.levelSumSquares += sample * sample;
    }
    this.levelSampleCount += chunk.length;

    // Remuestrear si la frecuencia de entrada no coincide con la objetivo
    const processedChunk =
      this.sourceSampleRate === this.targetSampleRate
        ? chunk
        : resampleAudio(chunk, this.sourceSampleRate, this.targetSampleRate);

    const chunkLen = processedChunk.length;

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
      this.samplesSinceLastWindow = 0;

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
  }
}

/**
 * Código fuente JavaScript puro del AudioWorkletProcessor para inyección como Blob/Data URL.
 * Esto asegura funcionamiento sin dependencias complejas de empaquetado Vite en tiempo de ejecución.
 */
export const AUDIO_WORKLET_PROCESSOR_CODE = `
class AudioWindowProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = ${String(AUDIO_CONSTANTS.TARGET_SAMPLE_RATE)};
    this.windowSamples = ${String(AUDIO_CONSTANTS.WINDOW_SAMPLES)};
    this.hopSamples = ${String(AUDIO_CONSTANTS.HOP_SAMPLES)};
    this.sourceSampleRate = sampleRate; // Global AudioWorklet sampleRate

    this.ringBuffer = new Float32Array(this.windowSamples);
    this.samplesAccumulatedTotal = 0;
    this.samplesSinceLastWindow = 0;
    this.windowIndex = 0;

    this.levelSampleCount = 0;
    this.levelSumSquares = 0;
    this.levelPeak = 0;
    this.levelInterval = Math.floor(sampleRate * 0.1);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const chunk = input[0];
    const chunkLen = chunk.length;

    // Métricas de nivel
    for (let i = 0; i < chunkLen; i++) {
      const val = chunk[i];
      const abs = Math.abs(val);
      if (abs > this.levelPeak) this.levelPeak = abs;
      this.levelSumSquares += val * val;
    }
    this.levelSampleCount += chunkLen;

    if (this.levelSampleCount >= this.levelInterval) {
      const rms = Math.sqrt(this.levelSumSquares / this.levelSampleCount);
      this.port.postMessage({
        type: 'LEVEL_UPDATE',
        rms,
        peak: this.levelPeak
      });
      this.levelSampleCount = 0;
      this.levelSumSquares = 0;
      this.levelPeak = 0;
    }

    // Actualizar ring buffer
    this.ringBuffer.copyWithin(0, chunkLen);
    this.ringBuffer.set(chunk, this.windowSamples - chunkLen);

    this.samplesAccumulatedTotal += chunkLen;
    this.samplesSinceLastWindow += chunkLen;

    const canEmitFirst = this.windowIndex === 0 && this.samplesAccumulatedTotal >= this.windowSamples;
    const canEmitNext = this.windowIndex > 0 && this.samplesSinceLastWindow >= this.hopSamples;

    if (canEmitFirst || canEmitNext) {
      // Normalizar copia para transferencia
      const windowBuf = new Float32Array(this.windowSamples);
      windowBuf.set(this.ringBuffer);

      let peak = 0;
      for (let i = 0; i < this.windowSamples; i++) {
        const abs = Math.abs(windowBuf[i]);
        if (abs > peak) peak = abs;
      }
      if (peak > 1e-4) {
        const factor = 0.95 / peak;
        for (let i = 0; i < this.windowSamples; i++) {
          windowBuf[i] *= factor;
        }
      }

      this.port.postMessage(
        {
          type: 'WINDOW_READY',
          buffer: windowBuf,
          windowIndex: this.windowIndex,
          timestamp: currentTime,
          sampleRate: this.targetSampleRate
        },
        [windowBuf.buffer]
      );

      this.windowIndex++;
      this.samplesSinceLastWindow = 0;
    }

    return true;
  }
}

registerProcessor('audio-window-processor', AudioWindowProcessor);
`;
