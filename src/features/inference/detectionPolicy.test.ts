import { describe, expect, it } from 'vitest';
import { applyDetectionPolicy } from './detectionPolicy';
import type { Detection } from './inference.types';

const candidate: Detection = {
  classIndex: 0, label: 'Turdus fuscater_Great Thrush', scientificName: 'Turdus fuscater', commonName: 'Great Thrush', confidence: 0,
};

describe('applyDetectionPolicy', () => {
  it.each([
    [0, null], [0.449999, null], [0.45, 'provisional'], [0.799999, 'provisional'], [0.8, 'confirmed_local'], [1, 'confirmed_local'],
  ])('classifies confidence %s as %s', (confidence, status) => {
    const result = applyDetectionPolicy([{ ...candidate, confidence }]);
    if (status === null) expect(result).toEqual([]);
    else expect(result[0]).toEqual({ ...candidate, confidence, status });
  });

  it('matches the policy for 1000 deterministic scenarios without mutating candidates', () => {
    for (let index = 0; index < 1000; index++) {
      const confidence = index / 999;
      const input = Object.freeze({ ...candidate, confidence });
      const result = applyDetectionPolicy([input]);
      if (confidence < 0.45) expect(result).toEqual([]);
      else expect(result[0]?.status).toBe(confidence < 0.8 ? 'provisional' : 'confirmed_local');
      expect(input).not.toHaveProperty('status');
    }
    expect(applyDetectionPolicy([])).toEqual([]);
  });

  it.each([NaN, Infinity, -0.01, 1.01])('rejects invalid confidence %s', (confidence) => {
    expect(() => applyDetectionPolicy([{ ...candidate, confidence }])).toThrow('Invalid detection confidence');
  });
});
