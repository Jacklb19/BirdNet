import { describe, it, expect } from 'vitest';
import {
  hzToMel,
  melToHz,
  createMelFilterbank,
  applyMelFilterbank,
  computeMelSpectrogram,
} from './mel';

describe('mel', () => {
  it('conversión bidireccional hzToMel y melToHz es invertible', () => {
    const originalHz = 1000;
    const mel = hzToMel(originalHz);
    const backHz = melToHz(mel);

    expect(backHz).toBeCloseTo(originalHz, 3);
  });

  it('0 Hz equivale a 0 Mel y 1000 Hz es ~1000 Mel', () => {
    expect(hzToMel(0)).toBeCloseTo(0, 4);
    expect(hzToMel(1000)).toBeCloseTo(999.98, 1);
  });

  it('createMelFilterbank genera el número correcto de filtros triangulares', () => {
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
      // Cada filtro debe tener al menos un valor positivo (el ápice del triángulo)
      const maxVal = Math.max(...Array.from(filter));
      expect(maxVal).toBeGreaterThan(0);
      expect(maxVal).toBeLessThanOrEqual(1.0);
    }
  });

  it('applyMelFilterbank calcula las energías mel correctamente', () => {
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

  it('computeMelSpectrogram genera la matriz correcta de dimensiones esperadas', () => {
    const sampleRate = 8000;
    const fftSize = 256;
    const hopLength = 128;
    // Señal de 1 segundo (8000 muestras)
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const result = computeMelSpectrogram(samples, sampleRate, fftSize, hopLength);

    const expectedFrames = Math.floor((samples.length - fftSize) / hopLength) + 1;
    expect(result.numFrames).toBe(expectedFrames);
    expect(result.numMelBands).toBe(64);
    expect(result.data.length).toBe(expectedFrames * 64);

    // Los valores deben estar en decibelios (números finitos)
    for (let i = 0; i < 100; i++) {
      expect(Number.isFinite(result.data[i])).toBe(true);
    }
  });
});
