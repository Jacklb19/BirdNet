import { describe, expect, it } from 'vitest';
import { poolWindows, SINGLE_WINDOW, type PoolingRule } from './windowPooling';

const window = (scores: Record<string, number>): Map<string, number> => new Map(Object.entries(scores));

describe('poolWindows', () => {
  it('lets the newest window decide alone under the single-window rule', () => {
    const pooled = poolWindows([window({ thrush: 0.9 }), window({ sparrow: 0.6 })], SINGLE_WINDOW);
    expect([...pooled]).toEqual([['sparrow', 0.6]]);
  });

  it('dilutes a lone spike and keeps a sustained song under the mean', () => {
    const rule: PoolingRule = { kind: 'mean', windows: 2 };
    const pooled = poolWindows([window({ spike: 0.9, song: 0.7 }), window({ song: 0.9 })], rule);
    expect(pooled.get('spike')).toBeCloseTo(0.45);
    expect(pooled.get('song')).toBeCloseTo(0.8);
  });

  it('lets a sure window stand and averages only the doubtful ones', () => {
    const rule: PoolingRule = { kind: 'mean', windows: 2, standsFrom: 0.8 };
    const pooled = poolWindows([window({ doubtful: 0.1 }), window({ sure: 0.9, doubtful: 0.7, edge: 0.8 })], rule);
    expect(pooled.get('sure')).toBe(0.9);
    expect(pooled.get('edge')).toBe(0.8);
    expect(pooled.get('doubtful')).toBeCloseTo(0.4);
    // A sure window that has already passed does not hold the level up.
    expect(poolWindows([window({ sure: 0.9 }), window({})], rule).get('sure')).toBeCloseTo(0.45);
  });

  it('averages only the windows there are while the session is younger than the span', () => {
    expect(poolWindows([window({ song: 0.8 })], { kind: 'mean', windows: 3 }).get('song')).toBeCloseTo(0.8);
  });

  it('reaches a threshold exactly when enough windows do under the rank rule', () => {
    const twoOfThree: PoolingRule = { kind: 'rank', windows: 3, rank: 2 };
    const recent = [window({ once: 0.95, twice: 0.5 }), window({ twice: 0.85 }), window({ twice: 0.2 })];
    const pooled = poolWindows(recent, twoOfThree);
    expect(pooled.get('twice')).toBe(0.5);
    expect(pooled.has('once')).toBe(false);
    expect(poolWindows(recent, { kind: 'rank', windows: 3, rank: 1 }).get('once')).toBe(0.95);
  });

  it('looks only at the newest windows of the span', () => {
    const recent = [window({ old: 1 }), window({ song: 0.6 }), window({ song: 0.8 })];
    const pooled = poolWindows(recent, { kind: 'mean', windows: 2 });
    expect(pooled.has('old')).toBe(false);
    expect(pooled.get('song')).toBeCloseTo(0.7);
  });

  it.each<PoolingRule>([
    { kind: 'mean', windows: 0 }, { kind: 'mean', windows: 1.5 }, { kind: 'mean', windows: 2, standsFrom: 1.2 }, { kind: 'rank', windows: 2, rank: 3 }, { kind: 'rank', windows: 2, rank: 0 },
  ])('rejects the malformed rule %o', (rule) => {
    expect(() => poolWindows([window({ song: 0.5 })], rule)).toThrow();
  });

  it('rejects a confidence that is not a probability', () => {
    expect(() => poolWindows([window({ song: 1.2 })], SINGLE_WINDOW)).toThrow('Invalid window confidence.');
  });
});
