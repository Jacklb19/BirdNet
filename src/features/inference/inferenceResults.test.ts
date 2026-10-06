import { describe, it, expect } from 'vitest';
import { sigmoid, parseLabel, extractTopDetections } from './inferenceResults';
describe('sigmoid', () => {
  it('returns 0.5 for a zero logit', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
  });

  it('approaches one for large positive logits', () => {
    expect(sigmoid(10)).toBeGreaterThan(0.9999);
  });

  it('approaches zero for large negative logits', () => {
    expect(sigmoid(-10)).toBeLessThan(0.0001);
  });

  it('remains numerically stable for extreme logits', () => {
    expect(Number.isFinite(sigmoid(1000))).toBe(true);
    expect(Number.isFinite(sigmoid(-1000))).toBe(true);
    expect(sigmoid(1000)).toBeCloseTo(1.0, 10);
    expect(sigmoid(-1000)).toBeCloseTo(0.0, 10);
  });
});

describe('parseLabel', () => {
  it('splits scientific and common names', () => {
    const result = parseLabel('Turdus fuscater_Great Thrush');
    expect(result.scientificName).toBe('Turdus fuscater');
    expect(result.commonName).toBe('Great Thrush');
  });

  it('handles labels without separators', () => {
    const result = parseLabel('Unknown species');
    expect(result.scientificName).toBe('Unknown species');
    expect(result.commonName).toBe('Unknown species');
  });

  it('preserves underscores in common names', () => {
    const result = parseLabel('Genus species_Common_Name_With_Underscores');
    expect(result.scientificName).toBe('Genus species');
    expect(result.commonName).toBe('Common_Name_With_Underscores');
  });
});

describe('extractTopDetections', () => {
  const testLabels = [
    'Turdus fuscater_Great Thrush',
    'Zonotrichia capensis_Rufous-collared Sparrow',
    'Troglodytes aedon_House Wren',
    'Tyrannus melancholicus_Tropical Kingbird',
    'Columba livia_Rock Pigeon',
  ];

  it('ranks known synthetic logits correctly', () => {
    const logits = new Float32Array([0.0, 5.0, -1.0, -2.0, -3.0]);
    const results = extractTopDetections(logits, 1, 0.1, testLabels);
    expect(results).toHaveLength(1);
    expect(results[0]?.scientificName).toBe('Zonotrichia capensis');
    expect(results[0]?.confidence).toBeGreaterThan(0.99);
  });

  it('discards probabilities below the threshold', () => {
    const logits = new Float32Array([-5.0, -5.0, -5.0, -5.0, -5.0]);
    const results = extractTopDetections(logits, 5, 0.1, testLabels);
    expect(results).toHaveLength(0);
  });

  it('sorts candidates by decreasing confidence', () => {
    const logits = new Float32Array([2.0, 4.0, 1.0, 3.0, 0.5]);
    const results = extractTopDetections(logits, 5, 0.1, testLabels);
    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev && curr) {
        expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
      }
    }
  });

  it('limits the result to topK candidates', () => {
    const logits = new Float32Array([2.0, 4.0, 1.0, 3.0, 0.5]);
    const results = extractTopDetections(logits, 2, 0.1, testLabels);
    expect(results).toHaveLength(2);
    expect(results[0]?.scientificName).toBe('Zonotrichia capensis');
    expect(results[1]?.scientificName).toBe('Tyrannus melancholicus');
  });
});
