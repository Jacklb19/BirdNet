import { describe, it, expect } from 'vitest';
import { calculatePeak, calculateRms, normalizeAudio } from './normalize';

describe('normalize', () => {
  it('calculatePeak finds the largest absolute amplitude', () => {
    const samples = new Float32Array([0.1, -0.7, 0.4, -0.2]);
    expect(calculatePeak(samples)).toBeCloseTo(0.7, 5);
  });

  it('calculateRms computes the root mean square', () => {
    // Values 3 and 4: squares 9 and 16, mean 12.5, root about 3.5355
    const samples = new Float32Array([3, 4]);
    expect(calculateRms(samples)).toBeCloseTo(Math.sqrt(12.5), 5);
  });

  it('calculateRms returns 0 for an empty buffer', () => {
    expect(calculateRms(new Float32Array(0))).toBe(0);
  });

  it('normalizeAudio scales the signal to targetPeak', () => {
    const samples = new Float32Array([-0.5, 0.25, 0.5]);
    const normalized = normalizeAudio(samples, 1.0);

    expect(calculatePeak(normalized)).toBeCloseTo(1.0, 5);
    expect(normalized[0]).toBeCloseTo(-1.0, 5);
    expect(normalized[1]).toBeCloseTo(0.5, 5);
    expect(normalized[2]).toBeCloseTo(1.0, 5);
    expect(calculatePeak(samples)).toBeCloseTo(0.5, 5); // the input is unchanged
  });

  it('normalizeAudio in place modifies the input buffer', () => {
    const samples = new Float32Array([-0.5, 0.5]);
    const normalized = normalizeAudio(samples, 0.95, true);

    expect(normalized).toBe(samples);
    expect(calculatePeak(samples)).toBeCloseTo(0.95, 5);
  });

  it('does not amplify signals below the silence threshold', () => {
    const samples = new Float32Array([1e-6, -1e-6]);
    const normalized = normalizeAudio(samples, 0.95);

    expect(normalized[0]).toBeCloseTo(1e-6, 8);
    expect(normalized[1]).toBeCloseTo(-1e-6, 8);
  });
});
