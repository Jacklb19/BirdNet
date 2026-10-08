import { describe, expect, it } from 'vitest';
import { hzToMel } from '../dsp/mel';
import { EMPTY_COLUMN, SpectrogramHistory } from './spectrogramHistory';
import { buildRamp, frequencyTicks, spectrogramLevel } from './spectrogramScale';

const range = { min: -60, max: 20 };

describe('spectrogram level', () => {
  it('maps the decibel range onto every colour step and clamps outside it', () => {
    expect(spectrogramLevel(-60, range, 64)).toBe(0);
    expect(spectrogramLevel(-200, range, 64)).toBe(0);
    expect(spectrogramLevel(20, range, 64)).toBe(63);
    expect(spectrogramLevel(Number.POSITIVE_INFINITY, range, 64)).toBe(63);
    expect(spectrogramLevel(-20, range, 64)).toBe(32);
    expect(spectrogramLevel(-20.1, range, 64)).toBe(31);
  });

  it('draws invalid values and an empty range as silence', () => {
    expect(spectrogramLevel(Number.NaN, range, 64)).toBe(0);
    expect(spectrogramLevel(0, { min: 5, max: 5 }, 64)).toBe(0);
  });
});

describe('colour ramp', () => {
  it('starts and ends on the outer stops and interpolates between them', () => {
    const ramp = buildRamp([[0, 0, 0, 0], [100, 200, 50, 255]], 3);
    expect([...ramp]).toEqual([0, 0, 0, 0, 50, 100, 25, 128, 100, 200, 50, 255]);
    const three = buildRamp([[0, 0, 0, 0], [10, 10, 10, 10], [30, 30, 30, 30]], 5);
    expect([...three.slice(8, 12)]).toEqual([10, 10, 10, 10]);
    expect([...three.slice(16, 20)]).toEqual([30, 30, 30, 30]);
  });
});

describe('frequency ticks', () => {
  it('rounds evenly spread mel positions to whole steps and places them on the mel axis', () => {
    const ticks = frequencyTicks(150, 15_000, 3, 1000);
    expect(ticks.map((tick) => tick.hz)).toEqual([1000, 3000, 9000]);
    const span = hzToMel(15_000) - hzToMel(150);
    for (const tick of ticks) expect(tick.position).toBeCloseTo((hzToMel(tick.hz) - hzToMel(150)) / span);
    expect(ticks.every((tick, index) => index === 0 || tick.position > (ticks[index - 1]?.position ?? 1))).toBe(true);
  });

  it('never labels a frequency outside the analysed band or twice', () => {
    expect(frequencyTicks(150, 900, 3, 1000)).toEqual([]);
    expect(frequencyTicks(150, 2000, 4, 1000).map((tick) => tick.hz)).toEqual([1000, 2000]);
  });
});

describe('spectrogram history', () => {
  // Two bands, four frames per window; each value is its frame number so the columns are easy to follow.
  const window = (windowIndex: number, first: number) => ({
    windowIndex, numFrames: 4, numMelBands: 2,
    data: Float32Array.from([0, 1, 2, 3].flatMap((frame) => [first + frame, first + frame])),
  });
  const shown = (history: SpectrogramHistory, layout: 'scroll' | 'sweep') =>
    Array.from({ length: history.columns }, (_, x) => {
      const column = history.columnAt(x, layout);
      return column === EMPTY_COLUMN ? null : history.level(column, 0);
    });

  it('adds a whole first window, then only the new hop of each consecutive window', () => {
    const history = new SpectrogramHistory(8, 2);
    history.append(window(0, 10), 2, (db) => db);
    expect(shown(history, 'scroll')).toEqual([null, null, null, null, 10, 11, 12, 13]);
    history.append(window(1, 12), 2, (db) => db);
    expect(shown(history, 'scroll')).toEqual([null, null, 10, 11, 12, 13, 14, 15]);
    // The same window again (a re-render) changes nothing.
    history.append(window(1, 12), 2, (db) => db);
    expect(shown(history, 'scroll')).toEqual([null, null, 10, 11, 12, 13, 14, 15]);
  });

  it('adds a whole window after a dropped one and keeps only the newest columns', () => {
    const history = new SpectrogramHistory(6, 2);
    history.append(window(0, 10), 2, (db) => db);
    history.append(window(2, 20), 2, (db) => db);
    expect(shown(history, 'scroll')).toEqual([12, 13, 20, 21, 22, 23]);
    expect([0, 1, 2, 3, 4, 5].map((x) => history.isLatest(history.columnAt(x, 'scroll')))).toEqual([false, false, true, true, true, true]);
  });

  it('fills in place without moving older columns when motion is reduced', () => {
    const history = new SpectrogramHistory(6, 2);
    history.append(window(0, 10), 2, (db) => db);
    expect(shown(history, 'sweep')).toEqual([10, 11, 12, 13, null, null]);
    history.append(window(1, 12), 2, (db) => db);
    expect(shown(history, 'sweep')).toEqual([10, 11, 12, 13, 14, 15]);
    // Full: the cursor wraps and overwrites the oldest columns where they are.
    history.append(window(2, 14), 2, (db) => db);
    expect(shown(history, 'sweep')).toEqual([16, 17, 12, 13, 14, 15]);
    history.clear();
    expect(history.empty).toBe(true);
    expect(shown(history, 'sweep')).toEqual([null, null, null, null, null, null]);
  });

  it('paints the highest band on top and leaves unwritten columns transparent', () => {
    const history = new SpectrogramHistory(2, 2);
    history.append({ windowIndex: 0, numFrames: 1, numMelBands: 2, data: Float32Array.from([0, 1]) }, 1, (db) => db);
    const ramp = buildRamp([[0, 0, 0, 255], [255, 255, 255, 255]], 2);
    const target = new Uint8ClampedArray(2 * 2 * 4);
    history.paint('scroll', { history: ramp, latest: ramp }, target);
    // Row 0 (top) holds band 1 (level 1, white); row 1 holds band 0 (level 0, black); column 0 is empty.
    expect([...target]).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 255]);
  });
});
