import { describe, expect, it } from 'vitest';
import { connectionAllows, hasRoomFor, wantsSecondModel } from './automaticAlternate';

describe('downloading the second model by itself (ADR-36)', () => {
  it('never starts on mobile data, with data saver or on a very slow link', () => {
    expect(connectionAllows({ type: 'cellular' })).toBe(false);
    expect(connectionAllows({ saveData: true, type: 'wifi' })).toBe(false);
    expect(connectionAllows({ effectiveType: '2g' })).toBe(false);
    expect(connectionAllows({ type: 'wifi', effectiveType: '4g' })).toBe(true);
    // Browsers that do not tell the network (iPhone, Firefox) download as the first model did.
    expect(connectionAllows(undefined)).toBe(true);
  });

  it('only when what listens would use it', () => {
    expect(wantsSecondModel({})).toBe(true);
    expect(wantsSecondModel({ detectionModel: 'preview' })).toBe(true);
    expect(wantsSecondModel({ detectionModel: 'standard' })).toBe(false);
    expect(wantsSecondModel({ tooSlowForTwo: true })).toBe(false);
    expect(wantsSecondModel({ detectionModel: 'combined', tooSlowForTwo: true })).toBe(true);
  });

  it('only with room for the model and its parts while it is checked', async () => {
    const estimate = (quota: number, usage: number) => ({ estimate: () => Promise.resolve({ quota, usage }) });
    expect(await hasRoomFor(80, estimate(1000, 800))).toBe(true);
    expect(await hasRoomFor(80, estimate(1000, 900))).toBe(false);
    expect(await hasRoomFor(80, undefined)).toBe(true);
    expect(await hasRoomFor(80, { estimate: () => Promise.reject(new Error('blocked')) })).toBe(true);
  });
});
