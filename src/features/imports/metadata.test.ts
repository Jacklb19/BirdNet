import { describe, expect, it } from 'vitest';
import { originalTimestamp } from './metadata';

describe('original recording time', () => {
  it('keeps missing dates unknown and applies only the chosen UTC offset', () => {
    expect(originalTimestamp('', '-05:00')).toBeNull();
    expect(originalTimestamp('2025-03-04T05:06', '-05:00')).toBe('2025-03-04T10:06:00.000Z');
    expect(originalTimestamp('2025-03-04T05:06:07.123', 'Z')).toBe('2025-03-04T05:06:07.123Z');
  });
  it('rejects impossible calendar dates and offsets', () => {
    for (const [date, offset] of [['2025-02-29T10:00', 'Z'], ['2024-02-30T10:00', 'Z'], ['2025-01-01T24:00', 'Z'], ['2025-01-01T00:00', '+14:01'], ['2025-01-01T00:00', '+25:00']]) expect(() => originalTimestamp(date ?? '', offset ?? '')).toThrow();
  });
});
