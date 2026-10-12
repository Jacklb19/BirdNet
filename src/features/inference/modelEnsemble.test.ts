import { describe, expect, it } from 'vitest';
import { averageScores, shareLabels } from './modelEnsemble';

describe('models deciding together', () => {
  const first = ['Turdus fuscater_Great Thrush', 'Zonotrichia capensis_Rufous-collared Sparrow'];
  const second = ['Zonotrichia capensis_Rufous-collared Sparrow', 'Grallaria ruficapilla_Chestnut-crowned Antpitta'];

  it('leaves a single model exactly as it is', () => {
    const { labels, positions } = shareLabels([first]);
    expect(labels).toEqual(first);
    expect(Array.from(positions[0] ?? [])).toEqual([0, 1]);
    expect(averageScores([new Map([[1, 0.7]])], positions, 0.01)).toEqual(new Map([[1, 0.7]]));
  });

  it('recognises a species by its scientific name and appends what only another model knows', () => {
    const { labels, positions } = shareLabels([first, second]);
    expect(labels).toEqual([...first, 'Grallaria ruficapilla_Chestnut-crowned Antpitta']);
    expect(Array.from(positions[1] ?? [])).toEqual([1, 2]);
  });

  it('averages what the models gave a species, counting a model that did not score it as zero', () => {
    const { positions } = shareLabels([first, second]);
    const mean = averageScores([new Map([[0, 0.5], [1, 0.9]]), new Map([[0, 0.7], [1, 0.012]])], positions, 0.01);
    expect(mean.get(0)).toBeCloseTo(0.25);
    expect(mean.get(1)).toBeCloseTo(0.8);
    // 0.012 / 2 falls under the floor: too little to remember.
    expect(mean.has(2)).toBe(false);
  });

  it('refuses scores that do not belong to their model', () => {
    const { positions } = shareLabels([first]);
    expect(() => averageScores([new Map([[5, 0.5]])], positions, 0.01)).toThrow();
    expect(() => averageScores([new Map(), new Map()], positions, 0.01)).toThrow();
  });
});
