import { describe, expect, it } from 'vitest';
import { addMonths, joinLocal, monthGrid, parseTime, splitLocal, weekday } from './calendar';

describe('calendar of the date field', () => {
  it('lays out a month in full weeks from the locale first day', () => {
    // November 2026 starts on a Sunday.
    expect(weekday({ year: 2026, month: 11, day: 1 })).toBe(0);
    const monday = monthGrid(2026, 11, 1);
    expect(monday[0]?.[0]).toEqual({ year: 2026, month: 10, day: 26 });
    expect(monday[0]?.[6]).toEqual({ year: 2026, month: 11, day: 1 });
    expect(monday.at(-1)?.at(-1)).toEqual({ year: 2026, month: 12, day: 6 });
    const sunday = monthGrid(2026, 11, 0);
    expect(sunday[0]?.[0]).toEqual({ year: 2026, month: 11, day: 1 });
    expect(sunday).toHaveLength(5);
  });

  it('handles leap years and month ends', () => {
    expect(monthGrid(2028, 2, 1).flat().filter((date) => date.month === 2)).toHaveLength(29);
    expect(addMonths({ year: 2027, month: 1, day: 31 }, 1)).toEqual({ year: 2027, month: 2, day: 28 });
    expect(addMonths({ year: 2026, month: 12, day: 15 }, 1)).toEqual({ year: 2027, month: 1, day: 15 });
    expect(addMonths({ year: 2026, month: 1, day: 15 }, -1)).toEqual({ year: 2025, month: 12, day: 15 });
  });

  it('reads and writes the local value a datetime-local input holds', () => {
    expect(splitLocal('2026-03-08T02:30')).toEqual({ date: { year: 2026, month: 3, day: 8 }, time: '02:30' });
    expect(splitLocal('2026-02-30T10:00')).toEqual({ date: null, time: '' });
    expect(splitLocal('')).toEqual({ date: null, time: '' });
    expect(joinLocal({ year: 2026, month: 3, day: 8 }, '02:30')).toBe('2026-03-08T02:30');
  });

  it('accepts times as typed on a phone and rejects impossible ones', () => {
    expect(parseTime('7')).toBe('07:00');
    expect(parseTime('7:05')).toBe('07:05');
    expect(parseTime('0730')).toBe('07:30');
    expect(parseTime('18.45')).toBe('18:45');
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('12:60')).toBeNull();
    expect(parseTime('noon')).toBeNull();
  });
});
