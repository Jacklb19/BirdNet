import { describe, it, expect } from 'vitest';
import {
  hzToMel,
  melToHz,
  createMelFilterbank,
  applyMelFilterbank,
  computeMelSpectrogram,
} from './mel';
import { AUDIO_CONSTANTS } from './audio.constants';

describe('mel', () => {
  it('hzToMel and melToHz are inverses', () => {
    const originalHz = 1000;
    const mel = hzToMel(originalHz);
    const backHz = melToHz(mel);

    expect(backHz).toBeCloseTo(originalHz, 3);
  });

  it('0 Hz is 0 mel and 1000 Hz is about 1000 mel', () => {
    expect(hzToMel(0)).toBeCloseTo(0, 4);
    expect(hzToMel(1000)).toBeCloseTo(999.98, 1);
  });

  it('createMelFilterbank builds the requested number of triangular filters', () => {
    const numBands = 32;
    const fftSize = 512;
    const filterbank = createMelFilterbank({
      sampleRate: 16000,
      fftSize,
      numMelBands: numBands,
      minFreqHz: 100,
      maxFreqHz: 8000,
    });

    expect(filterbank.length).toBe(numBands);
    for (const filter of filterbank) {
      expect(filter.length).toBe(fftSize / 2 + 1);
      // Every filter has at least one positive weight (the apex of the triangle)
      const maxVal = Math.max(...Array.from(filter));
      expect(maxVal).toBeGreaterThan(0);
      expect(maxVal).toBeLessThanOrEqual(1.0);
    }
  });

  it('applyMelFilterbank computes the mel energies', () => {
    const filterbank = createMelFilterbank({
      sampleRate: 8000,
      fftSize: 256,
      numMelBands: 10,
      minFreqHz: 200,
      maxFreqHz: 4000,
    });

    const magnitude = new Float32Array(129).fill(1.0);
    const melEnergies = applyMelFilterbank(magnitude, filterbank);

    expect(melEnergies.length).toBe(10);
    for (let i = 0; i < melEnergies.length; i++) {
      expect(melEnergies[i] ?? 0).toBeGreaterThan(0);
    }
  });

  it('computeMelSpectrogram returns a matrix of the expected dimensions', () => {
    const sampleRate = 8000;
    const fftSize = 256;
    const hopLength = 128;
    // One second of signal (8000 samples)
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const result = computeMelSpectrogram(samples, sampleRate, fftSize, hopLength);

    const expectedFrames = Math.floor((samples.length - fftSize) / hopLength) + 1;
    expect(result.numFrames).toBe(expectedFrames);
    expect(result.numMelBands).toBe(AUDIO_CONSTANTS.NUM_MEL_BANDS);
    expect(result.data.length).toBe(expectedFrames * AUDIO_CONSTANTS.NUM_MEL_BANDS);

    // Values are finite decibels
    for (let i = 0; i < 100; i++) {
      expect(Number.isFinite(result.data[i])).toBe(true);
    }
  });

  it('floors silence at MEL_LOG_FLOOR_DB, which the display range never goes below', () => {
    const silence = new Float32Array(AUDIO_CONSTANTS.FFT_SIZE);
    const result = computeMelSpectrogram(silence);
    expect(new Set(result.data)).toEqual(new Set([AUDIO_CONSTANTS.MEL_LOG_FLOOR_DB]));
    const { min, max } = AUDIO_CONSTANTS.SPECTROGRAM_DB_RANGE;
    expect(min).toBeGreaterThanOrEqual(AUDIO_CONSTANTS.MEL_LOG_FLOOR_DB);
    expect(max).toBeGreaterThan(min);
  });
});
