import { describe, expect, it } from 'vitest';
import { modelInUse } from './detectionChoices';
import { watchPace } from './pace';

const limits = { minWindows: 4, recentWindows: 3, maxMedianMs: 1000, maxDroppedShare: 0.2 };

describe('the model that listens by default (ADR-36)', () => {
  it('is both models once the second is on the phone, and the first alone until then', () => {
    expect(modelInUse(undefined, true)).toBe('combined');
    expect(modelInUse(undefined, false)).toBe('standard');
  });

  it('goes back to the first model on a phone too slow for two, but never overrides a choice', () => {
    expect(modelInUse(undefined, true, true)).toBe('standard');
    expect(modelInUse('combined', true, true)).toBe('combined');
    expect(modelInUse('preview', true, true)).toBe('preview');
    expect(modelInUse('preview', false)).toBe('standard');
  });
});

describe('whether a phone keeps up with two models', () => {
  it('waits for enough windows before judging the time per window', () => {
    const pace = watchPace(limits);
    for (let window = 0; window < 3; window++) pace.analysed(1400);
    expect(pace.tooSlow()).toBe(false);
    pace.analysed(1400);
    expect(pace.tooSlow()).toBe(true);
  });

  it('judges the latest windows, so a slow start alone does not count', () => {
    const pace = watchPace(limits);
    for (const latency of [3000, 3000, 400, 450, 420, 500]) pace.analysed(latency);
    expect(pace.tooSlow()).toBe(false);
  });

  it('is too slow when back-pressure drops more than the allowed share of windows', () => {
    const pace = watchPace(limits);
    for (let window = 0; window < 4; window++) pace.analysed(400);
    expect(pace.tooSlow()).toBe(false);
    pace.dropped(1);
    expect(pace.tooSlow()).toBe(false);
    pace.dropped(1);
    expect(pace.tooSlow()).toBe(true);
    // The verdict holds for the rest of the session.
    for (let window = 0; window < 10; window++) pace.analysed(100);
    expect(pace.tooSlow()).toBe(true);
  });

  it('ignores values that are not measurements', () => {
    const pace = watchPace(limits);
    for (const latency of [Number.NaN, -5, Number.POSITIVE_INFINITY]) pace.analysed(latency);
    pace.dropped(-3);
    pace.dropped(1.5);
    expect(pace.tooSlow()).toBe(false);
  });
});
