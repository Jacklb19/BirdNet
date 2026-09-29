import { describe, it, expect } from 'vitest';
import {
  createHannWindow,
  applyWindow,
  fftInPlace,
  computeMagnitudeSpectrum,
} from './fft';

describe('fft', () => {
  it('createHannWindow genera ventana simétrica con extremos cercanos a 0', () => {
    const n = 64;
    const window = createHannWindow(n);

    expect(window.length).toBe(n);
    expect(window[0]).toBeCloseTo(0, 5);
    expect(window[n - 1]).toBeCloseTo(0, 5);
    expect(window[n / 2]).toBeCloseTo(1, 1);
  });

  it('applyWindow multiplica elemento a elemento', () => {
    const samples = new Float32Array([2, 4, 6]);
    const window = new Float32Array([0.5, 0.25, 0.5]);
    const output = applyWindow(samples, window);

    expect(output[0]).toBeCloseTo(1, 5);
    expect(output[1]).toBeCloseTo(1, 5);
    expect(output[2]).toBeCloseTo(3, 5);
  });

  it('fftInPlace lanza error si la longitud no es potencia de dos', () => {
    const real = new Float32Array(10);
    const imag = new Float32Array(10);
    expect(() => {
      fftInPlace(real, imag);
    }).toThrow();
  });

  it('detecta correctamente la frecuencia de una onda senoidal pura', () => {
    const n = 256;
    const sampleRate = 8000;
    const targetFreq = 1000; // Bin esperado: 1000 / (8000 / 256) = 32

    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      real[i] = Math.sin((2 * Math.PI * targetFreq * i) / sampleRate);
    }

    fftInPlace(real, imag);

    // Calcular magnitudes
    const magnitudes = new Float32Array(n / 2 + 1);
    for (let k = 0; k < magnitudes.length; k++) {
      const r = real[k] ?? 0;
      const im = imag[k] ?? 0;
      magnitudes[k] = Math.sqrt(r * r + im * im);
    }

    // Encontrar bin con magnitud máxima
    let maxBin = 0;
    let maxMag = 0;
    for (let k = 0; k < magnitudes.length; k++) {
      const mag = magnitudes[k] ?? 0;
      if (mag > maxMag) {
        maxMag = mag;
        maxBin = k;
      }
    }

    expect(maxBin).toBe(32);
  });

  it('computeMagnitudeSpectrum calcula el espectro unilateral con ventana de Hann', () => {
    const n = 128;
    const frame = new Float32Array(n).fill(1); // Señal constante
    const window = createHannWindow(n);
    const spectrum = computeMagnitudeSpectrum(frame, window);

    expect(spectrum.length).toBe(n / 2 + 1);
    expect(spectrum[0]).toBeGreaterThan(0); // Energía principal en baja frecuencia
  });
});
