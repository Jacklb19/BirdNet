import { describe, expect, it } from 'vitest';
import { SKY_PHASE_STARTS } from '../config/sky';
import { skyPhase } from './sky';

describe('sky of the hour (ADR-20)', () => {
  it('follows the local clock and keeps the night going past midnight', () => {
    const at = (hour: number): Date => new Date(2026, 9, 7, hour, 30);
    expect(skyPhase(at(2))).toBe('night');
    expect(skyPhase(at(6))).toBe('dawn');
    expect(skyPhase(at(12))).toBe('day');
    expect(skyPhase(at(18))).toBe('dusk');
    expect(skyPhase(at(23))).toBe('night');
    for (const start of SKY_PHASE_STARTS) expect(skyPhase(new Date(2026, 9, 7, start.hour))).toBe(start.phase);
  });
});
