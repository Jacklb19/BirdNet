import { AUDIO_CONSTANTS } from './audio.constants';
import { createHannWindow, computeMagnitudeSpectrum } from './fft';

/**
 * Coefficients of the HTK mel scale, mel = factor * log10(1 + hz / cornerHz): roughly linear below the
 * corner frequency and logarithmic above it, like pitch perception.
 */
const HTK_MEL_SCALE = Object.freeze({ factor: 2595, cornerHz: 700 });

/** Converts a frequency in hertz to mels. */
export function hzToMel(hz: number): number {
  return HTK_MEL_SCALE.factor * Math.log10(1 + hz / HTK_MEL_SCALE.cornerHz);
}

/** Converts mels back to hertz; the inverse of `hzToMel`. */
export function melToHz(mel: number): number {
  return HTK_MEL_SCALE.cornerHz * (Math.pow(10, mel / HTK_MEL_SCALE.factor) - 1);
}

/** Mel energy in decibels, floored so silent bands stay finite (never below `MEL_LOG_FLOOR_DB`). */
export function melEnergyToDb(energy: number): number {
  return AUDIO_CONSTANTS.POWER_DECIBEL_FACTOR * Math.log10(Math.max(energy, AUDIO_CONSTANTS.MEL_LOG_FLOOR));
}

export interface MelFilterbankConfig {
  sampleRate: number;
  fftSize: number;
  numMelBands: number;
  minFreqHz: number;
  maxFreqHz: number;
}

/** Filterbank of the on-screen spectrogram at the model sample rate. */
export const DEFAULT_MEL_FILTERBANK: Readonly<MelFilterbankConfig> = Object.freeze({
  sampleRate: AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
  fftSize: AUDIO_CONSTANTS.FFT_SIZE,
  numMelBands: AUDIO_CONSTANTS.NUM_MEL_BANDS,
  minFreqHz: AUDIO_CONSTANTS.MIN_FREQUENCY_HZ,
  maxFreqHz: AUDIO_CONSTANTS.MAX_FREQUENCY_HZ,
});

/**
 * Precomputed triangular mel filterbank. Each row is one mel filter holding weights over the
 * spectrum bins (fftSize / 2 + 1).
 */
export function createMelFilterbank(config: Readonly<MelFilterbankConfig> = DEFAULT_MEL_FILTERBANK): Float32Array[] {
  const { sampleRate, fftSize, numMelBands, minFreqHz, maxFreqHz } = config;
  const numBins = (fftSize >> 1) + 1;

  const minMel = hzToMel(minFreqHz);
  const maxMel = hzToMel(maxFreqHz);

  // Points evenly spaced on the mel scale.
  const melPoints = new Float32Array(numMelBands + 2);
  const melStep = (maxMel - minMel) / (numMelBands + 1);
  for (let i = 0; i < melPoints.length; i++) {
    melPoints[i] = minMel + i * melStep;
  }

  // Map each point to its nearest FFT bin.
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

    // Rising edge.
    if (centerBin > leftBin) {
      for (let k = leftBin; k < centerBin; k++) {
        filter[k] = (k - leftBin) / (centerBin - leftBin);
      }
    }

    // Falling edge.
    if (rightBin > centerBin) {
      for (let k = centerBin; k <= rightBin; k++) {
        filter[k] = (rightBin - k) / (rightBin - centerBin);
      }
    }

    filterbank.push(filter);
  }

  return filterbank;
}

/** Applies the mel filterbank to a magnitude spectrum, writing into `melEnergiesOutput` when given. */
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
  /** Row-major matrix [numFrames, numMelBands] in decibels. */
  data: Float32Array;
  numFrames: number;
  numMelBands: number;
}

/**
 * Mel spectrogram in decibels of a whole signal (see `melEnergyToDb` for the scale).
 *
 * @param samples Audio samples, typically one analysis window.
 * @param sampleRate Sample rate in Hz.
 * @param fftSize FFT frame length.
 * @param hopLength Samples between consecutive frames.
 * @param filterbank Precomputed mel filterbank; built from `AUDIO_CONSTANTS` when omitted.
 */
export function computeMelSpectrogram(
  samples: Float32Array,
  sampleRate: number = AUDIO_CONSTANTS.TARGET_SAMPLE_RATE,
  fftSize: number = AUDIO_CONSTANTS.FFT_SIZE,
  hopLength: number = AUDIO_CONSTANTS.STFT_HOP_LENGTH,
  filterbank?: Float32Array[],
): MelSpectrogramResult {
  const actualFilterbank = filterbank ?? createMelFilterbank({ ...DEFAULT_MEL_FILTERBANK, sampleRate, fftSize });

  const numMelBands = actualFilterbank.length;
  const window = createHannWindow(fftSize);

  // Number of complete frames that fit in the signal.
  const numFrames =
    samples.length >= fftSize ? Math.floor((samples.length - fftSize) / hopLength) + 1 : 0;

  const data = new Float32Array(numFrames * numMelBands);

  // Work buffers reused by every frame so the loop does not allocate.
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

    const rowOffset = f * numMelBands;
    for (let m = 0; m < numMelBands; m++) {
      data[rowOffset + m] = melEnergyToDb(melBandBuffer[m] ?? 0);
    }
  }

  return { data, numFrames, numMelBands };
}
