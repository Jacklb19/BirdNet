import { describe, expect, it } from 'vitest';
import { formatDayHeading, formatDayTime, formatTime } from './logFormat';

describe('log formatting', () => {
  it('writes times on the 24-hour clock in every language', () => {
    const dusk = new Date(2026, 9, 6, 17, 48).getTime();
    expect(formatTime(dusk, 'es')).toContain('17:48');
    expect(formatTime(dusk, 'en')).toContain('17:48');
  });

  it('shows the year only for another year', () => {
    const now = new Date(2026, 9, 7);
    expect(formatDayHeading(new Date(2026, 9, 5), now, 'en')).not.toContain('2026');
    expect(formatDayHeading(new Date(2025, 11, 31), now, 'en')).toContain('2025');
    expect(formatDayTime(new Date(2026, 8, 28, 6, 30).getTime(), now, 'en')).not.toContain('2026');
    expect(formatDayTime(new Date(2025, 11, 31, 6, 30).getTime(), now, 'en')).toContain('2025');
  });
});
