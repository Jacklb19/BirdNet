import { AUDIO_CONSTANTS } from './audio.constants';
import { createHannWindow, computeMagnitudeSpectrum } from './fft';

/**
 * Convierte frecuencia en Hertz a escala Mel.
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Convierte valor en escala Mel a frecuencia en Hertz.
 */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export interface MelFilterbankConfig {
  sampleRate: number;
  fftSize: number;
  numMelBands: number;
  minFreqHz: number;
  maxFreqHz: number;
}

/**
 * Genera un banco de filtros triangulares Mel precalculados.
 * Devuelve un array de Float32Array, donde cada fila corresponde a un filtro Mel
 * con pesos sobre los bins espectrales (fftSize / 2 + 1).
 */
export function createMelFilterbank(
  config: MelFilterbankConfig = {
    sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
    fftSize: AUDIO_CONSTANTS.FFT_SIZE,
    numMelBands: AUDIO_CONSTANTS.NUM_MEL_BANDS,
    minFreqHz: AUDIO_CONSTANTS.MIN_FREQUENCY_HZ,
    maxFreqHz: AUDIO_CONSTANTS.MAX_FREQUENCY_HZ,
  },
): Float32Array[] {
  const { sampleRate, fftSize, numMelBands, minFreqHz, maxFreqHz } = config;
  const numBins = (fftSize >> 1) + 1;

  const minMel = hzToMel(minFreqHz);
  const maxMel = hzToMel(maxFreqHz);

  // Puntos equidistantes en escala Mel
  const melPoints = new Float32Array(numMelBands + 2);
  const melStep = (maxMel - minMel) / (numMelBands + 1);
  for (let i = 0; i < melPoints.length; i++) {
    melPoints[i] = minMel + i * melStep;
  }

  // Convertir puntos a bins de frecuencia FFT
  const binPoints = new Int32Array(numMelBands + 2);
  for (let i = 0; i < binPoints.length; i++) {
    const hz = melToHz(melPoints[i] ?? 0);
    const bin = Math.round((hz * fftSize) / sampleRate);
    binPoints[i] = Math.min(Math.max(bin, 0), numBins - 1);
  }

  const filterbank: Float32Array[] = [];

  for (let m = 0; m < numMelBands; m++) {
    const filter = new Float32Array(numBins);
    const leftBin = binPoints[m] ?? 0;
    const centerBin = binPoints[m + 1] ?? 0;
    const rightBin = binPoints[m + 2] ?? 0;

    // Rampa ascendente
    if (centerBin > leftBin) {
      for (let k = leftBin; k < centerBin; k++) {
        filter[k] = (k - leftBin) / (centerBin - leftBin);
      }
    }

    // Rampa descendente
    if (rightBin > centerBin) {
      for (let k = centerBin; k <= rightBin; k++) {
        filter[k] = (rightBin - k) / (rightBin - centerBin);
      }
    }

    filterbank.push(filter);
  }

  return filterbank;
}

/**
 * Aplica el banco de filtros Mel a un vector de espectro de magnitud.
 */
export function applyMelFilterbank(
  magnitudeSpectrum: Float32Array,
  filterbank: Float32Array[],
  melEnergiesOutput?: Float32Array,
): Float32Array {
  const numBands = filterbank.length;
  const output = melEnergiesOutput ?? new Float32Array(numBands);

  for (let m = 0; m < numBands; m++) {
    const filter = filterbank[m];
    if (!filter) {
      continue;
    }
    let sum = 0;
    const len = Math.min(magnitudeSpectrum.length, filter.length);
    for (let k = 0; k < len; k++) {
      sum += (magnitudeSpectrum[k] ?? 0) * (filter[k] ?? 0);
    }
    output[m] = sum;
  }

  return output;
}

export interface MelSpectrogramResult {
  /** Matriz aplanada [numFrames, numMelBands] */
  data: Float32Array;
  numFrames: number;
  numMelBands: number;
}

/**
 * Calcula el mel-espectrograma en decibelios (dB) para una señal de audio completa.
 *
 * @param samples Muestras de audio (ej: 144.000 muestras para 3 s a 48 kHz)
 * @param sampleRate Frecuencia de muestreo (Hz)
 * @param fftSize Tamaño de ventana FFT
 * @param hopLength Desplazamiento temporal de trama
 * @param filterbank Banco de filtros Mel precalculado
 */
export function computeMelSpectrogram(
  samples: Float32Array,
  sampleRate: number = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
  fftSize: number = AUDIO_CONSTANTS.FFT_SIZE,
  hopLength: number = AUDIO_CONSTANTS.STFT_HOP_LENGTH,
  filterbank?: Float32Array[],
): MelSpectrogramResult {
  const actualFilterbank =
    filterbank ??
    createMelFilterbank({
      sampleRate,
      fftSize,
      numMelBands: AUDIO_CONSTANTS.NUM_MEL_BANDS,
      minFreqHz: AUDIO_CONSTANTS.MIN_FREQUENCY_HZ,
      maxFreqHz: AUDIO_CONSTANTS.MAX_FREQUENCY_HZ,
    });

  const numMelBands = actualFilterbank.length;
  const window = createHannWindow(fftSize);

  // Número de tramas posibles
  const numFrames =
    samples.length >= fftSize ? Math.floor((samples.length - fftSize) / hopLength) + 1 : 0;

  const data = new Float32Array(numFrames * numMelBands);

  // Búferes auxiliares reusados en cada trama para evitar recolector de basura
  const frameBuffer = new Float32Array(fftSize);
  const realBuffer = new Float32Array(fftSize);
  const imagBuffer = new Float32Array(fftSize);
  const magnitudeBuffer = new Float32Array((fftSize >> 1) + 1);
  const melBandBuffer = new Float32Array(numMelBands);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopLength;
    for (let i = 0; i < fftSize; i++) {
      frameBuffer[i] = samples[offset + i] ?? 0;
    }

    computeMagnitudeSpectrum(frameBuffer, window, realBuffer, imagBuffer, magnitudeBuffer);
    applyMelFilterbank(magnitudeBuffer, actualFilterbank, melBandBuffer);

    // Convertir a dB: 10 * log10(max(val, 1e-10))
    const rowOffset = f * numMelBands;
    for (let m = 0; m < numMelBands; m++) {
      const val = melBandBuffer[m] ?? 0;
      data[rowOffset + m] = 10 * Math.log10(Math.max(val, 1e-10));
    }
  }

  return { data, numFrames, numMelBands };
}
