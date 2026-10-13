import { describe, expect, it } from 'vitest';
import { clipsToEvict, decideClip, type SongClip, type SongLimits } from './recordingPolicy';

const LIMITS: SongLimits = { gapMs: 15_000, maxMs: 60_000 };
const SONG: SongClip = { detectionId: 'first', confidence: 0.7, startedAt: 0, lastHeardAt: 3_000 };

describe('decideClip', () => {
  it('keeps the clip of the first detection of a species', () => {
    expect(decideClip(undefined, { detectionId: 'a', confidence: 0.5, recordedAt: 1_000 }, LIMITS)).toEqual({
      action: 'keep', song: { detectionId: 'a', confidence: 0.5, startedAt: 1_000, lastHeardAt: 1_000 },
    });
  });

  it('replaces the clip when the same song is heard more clearly', () => {
    expect(decideClip(SONG, { detectionId: 'b', confidence: 0.9, recordedAt: 4_500 }, LIMITS)).toEqual({
      action: 'replace', song: { detectionId: 'b', confidence: 0.9, startedAt: 0, lastHeardAt: 4_500 },
    });
  });

  it('skips a detection no clearer than the kept one, but the song goes on', () => {
    expect(decideClip(SONG, { detectionId: 'b', confidence: 0.7, recordedAt: 4_500 }, LIMITS)).toEqual({
      action: 'skip', song: { ...SONG, lastHeardAt: 4_500 },
    });
  });

  it('starts a new song after the gap, even with a lower confidence', () => {
    const decision = decideClip(SONG, { detectionId: 'b', confidence: 0.5, recordedAt: 18_001 }, LIMITS);
    expect(decision.action).toBe('keep');
    expect(decision.song.detectionId).toBe('b');
    expect(decideClip(SONG, { detectionId: 'b', confidence: 0.5, recordedAt: 18_000 }, LIMITS).action).toBe('skip');
  });

  it('starts a new song when a bird has been singing without pause for too long', () => {
    const long: SongClip = { ...SONG, lastHeardAt: 59_000 };
    expect(decideClip(long, { detectionId: 'b', confidence: 0.5, recordedAt: 60_500 }, LIMITS).action).toBe('keep');
  });

  it('treats a detection older than the song as another song', () => {
    expect(decideClip(SONG, { detectionId: 'b', confidence: 0.9, recordedAt: 1_000 }, LIMITS).action).toBe('keep');
  });
});

describe('clipsToEvict', () => {
  const stored = [
    { id: 'new', bytes: 40, recordedAt: '2026-10-11T10:00:00.000Z' },
    { id: 'old', bytes: 40, recordedAt: '2026-10-09T10:00:00.000Z' },
    { id: 'mid', bytes: 40, recordedAt: '2026-10-10T10:00:00.000Z' },
  ];

  it('evicts nothing while everything fits', () => {
    expect(clipsToEvict(stored, 30, 150)).toEqual([]);
  });

  it('evicts the oldest clips until the incoming one fits', () => {
    expect(clipsToEvict(stored, 30, 149)).toEqual(['old']);
    expect(clipsToEvict(stored, 100, 149)).toEqual(['old', 'mid']);
  });
});
