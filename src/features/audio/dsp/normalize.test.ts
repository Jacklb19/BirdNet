import { describe, it, expect } from 'vitest';
import { calculatePeak, calculateRms, normalizeAudio } from './normalize';

describe('normalize', () => {
  it('calculatePeak encuentra la amplitud máxima absoluta correcta', () => {
    const samples = new Float32Array([0.1, -0.7, 0.4, -0.2]);
    expect(calculatePeak(samples)).toBeCloseTo(0.7, 5);
  });

  it('calculateRms calcula el valor cuadrático medio correcto', () => {
    // Array con dos valores: 3 y 4 -> cuadrados 9 y 16 -> media 12.5 -> sqrt = ~3.5355
    const samples = new Float32Array([3, 4]);
    expect(calculateRms(samples)).toBeCloseTo(Math.sqrt(12.5), 5);
  });

  it('calculateRms retorna 0 para array vacío', () => {
    expect(calculateRms(new Float32Array(0))).toBe(0);
  });

  it('normalizeAudio escala la señal al targetPeak', () => {
    const samples = new Float32Array([-0.5, 0.25, 0.5]);
    const normalized = normalizeAudio(samples, 1.0);

    expect(calculatePeak(normalized)).toBeCloseTo(1.0, 5);
    expect(normalized[0]).toBeCloseTo(-1.0, 5);
    expect(normalized[1]).toBeCloseTo(0.5, 5);
    expect(normalized[2]).toBeCloseTo(1.0, 5);
    expect(calculatePeak(samples)).toBeCloseTo(0.5, 5); // no modificó el original
  });

  it('normalizeAudio en modo inPlace modifica el array original', () => {
    const samples = new Float32Array([-0.5, 0.5]);
    const normalized = normalizeAudio(samples, 0.95, true);

    expect(normalized).toBe(samples);
    expect(calculatePeak(samples)).toBeCloseTo(0.95, 5);
  });

  it('no amplifica señales bajo el umbral de silencio para evitar ruido', () => {
    const samples = new Float32Array([1e-6, -1e-6]);
    const normalized = normalizeAudio(samples, 0.95);

    expect(normalized[0]).toBeCloseTo(1e-6, 8);
    expect(normalized[1]).toBeCloseTo(-1e-6, 8);
  });
});
