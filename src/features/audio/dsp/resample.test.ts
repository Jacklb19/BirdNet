import { describe, it, expect } from 'vitest';
import { resampleAudio, StreamingResampler } from './resample';

describe('resampleAudio', () => {
  it('devuelve una copia idéntica si las frecuencias de muestreo son iguales', () => {
    const input = new Float32Array([0.1, 0.5, -0.3, 0.8]);
    const result = resampleAudio(input, 48000, 48000);

    expect(result.length).toBe(input.length);
    expect(Array.from(result)).toEqual(Array.from(input));
    expect(result).not.toBe(input); // nueva instancia
  });

  it('remuestrea correctamente al duplicar la tasa de muestreo (upsampling)', () => {
    // 2 muestras a 10 Hz remuestreadas a 20 Hz -> 4 muestras
    const input = new Float32Array([0.0, 1.0]);
    const result = resampleAudio(input, 10, 20);

    expect(result.length).toBe(4);
    expect(result[0]).toBeCloseTo(0.0, 4);
    expect(result[1]).toBeCloseTo(0.5, 4);
    expect(result[2]).toBeCloseTo(1.0, 4);
    expect(result[3]).toBeCloseTo(1.0, 4);
  });

  it('remuestrea correctamente al reducir la tasa de muestreo (downsampling)', () => {
    // 4 muestras a 20 Hz remuestreadas a 10 Hz -> 2 muestras
    const input = new Float32Array([0.0, 0.5, 1.0, 1.0]);
    const result = resampleAudio(input, 20, 10);

    expect(result.length).toBe(2);
    expect(result[0]).toBeCloseTo(0.0, 4);
    expect(result[1]).toBeCloseTo(1.0, 4);
  });

  it('lanza error si las frecuencias de muestreo son no positivas', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(() => resampleAudio(input, 0, 48000)).toThrow();
    expect(() => resampleAudio(input, 48000, -10)).toThrow();
  });

  it('maneja arrays vacíos sin fallar', () => {
    const input = new Float32Array(0);
    const result = resampleAudio(input, 44100, 48000);
    expect(result.length).toBe(0);
  });
});

describe('StreamingResampler', () => {
  it('conserva continuidad de señal lineal a través de múltiples chunks sucesivos', () => {
    const resampler = new StreamingResampler(10, 20);
    // Señal rampa continua de 0 a 30 en 4 chunks de 2 muestras cada uno
    const chunk1 = new Float32Array([0, 10]);
    const chunk2 = new Float32Array([20, 30]);

    const out1 = resampler.processChunk(chunk1);
    const out2 = resampler.processChunk(chunk2);

    const merged = new Float32Array(out1.length + out2.length);
    merged.set(out1, 0);
    merged.set(out2, out1.length);

    // Con rampa lineal y factor 2x, los pasos deben ser exactamente 5
    for (let i = 1; i < merged.length; i++) {
      const curr = merged[i] ?? 0;
      const prev = merged[i - 1] ?? 0;
      const step = curr - prev;
      expect(step).toBeCloseTo(5.0, 3);
    }
  });

  it('devuelve una copia idéntica cuando source y target son iguales', () => {
    const resampler = new StreamingResampler(48000, 48000);
    const chunk = new Float32Array([1, 2, 3]);
    const out = resampler.processChunk(chunk);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('lanza error si las frecuencias son no positivas', () => {
    expect(() => new StreamingResampler(-1, 48000)).toThrow();
    expect(() => new StreamingResampler(48000, 0)).toThrow();
  });
});

