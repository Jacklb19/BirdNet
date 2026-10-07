import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, readPreferences } from '../config/storage';
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDecibels,
  formatDecimal,
  formatFrequency,
  formatKilohertz,
  formatMeters,
  formatMilliseconds,
  formatPercent,
  formatRelativeTime,
  formatSeconds,
  relativeTime,
  selectPlural,
} from './formatters';
import { I18nProvider } from './I18nProvider';
import { DEFAULT_LOCALE, LOCALES, intlTag } from './locales';
import { dictionaries } from './messages';
import { useI18n } from './useI18n';

/** Every leaf is a non-empty string, or a function that returns one for sample arguments. */
function assertFilled(value: unknown, path: string): void {
  if (typeof value === 'function') {
    const sample = Array.from({ length: value.length }, (_, index) => `arg${String(index)}`);
    const text: unknown = Reflect.apply(value, undefined, sample);
    expect(typeof text, `${path} must return a string`).toBe('string');
    expect(String(text).trim(), `${path} must not be empty`).not.toBe('');
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertFilled(child, `${path}.${key}`);
    return;
  }
  expect(typeof value, `${path} must be a string`).toBe('string');
  expect(String(value).trim(), `${path} must not be empty`).not.toBe('');
}

describe('dictionaries', () => {
  it('fills every text of every language', () => {
    for (const { code } of LOCALES) assertFilled(dictionaries[code], code);
  });
});

describe('I18nProvider', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
  });

  it('declares the stored language on mount and follows later changes', () => {
    // A language other than the default, so the assertion proves the stored value was applied.
    const stored = LOCALES.find((entry) => entry.code !== DEFAULT_LOCALE)?.code;
    if (!stored) throw new Error('This test needs a second language.');
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ locale: stored }));
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.locale).toBe(stored);
    expect(document.documentElement.lang).toBe(stored);
    act(() => { result.current.setLocale(DEFAULT_LOCALE); });
    expect(document.documentElement.lang).toBe(DEFAULT_LOCALE);
    expect(readPreferences().locale).toBe(DEFAULT_LOCALE);
  });

  it('falls back to the default language when the stored one is unknown', () => {
    localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({ locale: 'xx' }));
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    expect(result.current.locale).toBe(DEFAULT_LOCALE);
  });
});

describe('formatters', () => {
  it('uses each language decimal separator', () => {
    expect(formatDecimal(48.3, 'es', 1)).toBe('48,3');
    expect(formatDecimal(48.3, 'en', 1)).toBe('48.3');
  });

  it('formats percentages with the locale symbol placement', () => {
    expect(formatPercent(0.895, 'es', 1)).toMatch(/89,5\s*%/);
    expect(formatPercent(0.895, 'en', 1)).toBe('89.5%');
  });

  it('formats frequencies and levels with their international symbols', () => {
    expect(formatFrequency(48000, 'es')).toMatch(/^48\.000\s+Hz$/);
    expect(formatFrequency(48000, 'en')).toMatch(/^48,000\s+Hz$/);
    expect(formatDecibels(-14.2, 'es', 1)).toMatch(/^-14,2\s+dBFS$/);
    expect(formatDecibels(-14.2, 'en', 1)).toMatch(/^-14\.2\s+dBFS$/);
  });

  it('formats durations with Intl units', () => {
    expect(formatMilliseconds(24.6, 'es', 1)).toMatch(/^24,6\s+ms$/);
    expect(formatMilliseconds(24.6, 'en', 1)).toMatch(/^24\.6\s+ms$/);
    expect(formatSeconds(3, 'es', 0)).toMatch(/^3\s+s$/);
    expect(formatSeconds(2.5, 'en')).toMatch(/^2\.5\s+sec$/);
  });

  it('formats sizes in decimal megabytes', () => {
    const bytes = 38_727_042;
    expect(formatBytes(bytes, 'es')).toMatch(/^38,7\s+MB$/);
    expect(formatBytes(bytes, 'en')).toMatch(/^38\.7\s+MB$/);
  });

  it('formats dates per language', () => {
    const testDate = new Date('2026-10-12T14:30:00Z');
    expect(formatDate(testDate, 'es')).not.toEqual(formatDate(testDate, 'en'));
  });

  it('formats kilohertz with the shared symbol, or bare for axis labels', () => {
    expect(formatKilohertz(15_000, 'es')).toMatch(/^15\s+kHz$/);
    expect(formatKilohertz(1_500, 'es')).toMatch(/^1,5\s+kHz$/);
    expect(formatKilohertz(1_500, 'en')).toMatch(/^1\.5\s+kHz$/);
    expect(formatKilohertz(8_000, 'en', { withSymbol: false })).toBe('8');
  });

  it('formats distances in metres', () => {
    expect(formatMeters(100, 'es')).toMatch(/^100\s+m$/);
    expect(formatMeters(1_500, 'en')).toMatch(/^1,500\s+m$/);
  });
});

describe('counted phrases', () => {
  const songs = { one: (count: string) => `${count} canto`, other: (count: string) => `${count} cantos` };

  it('picks the form with each language plural rules', () => {
    expect(selectPlural(songs, 1, 'es')).toBe(songs.one);
    expect(selectPlural(songs, 0, 'es')).toBe(songs.other);
    expect(selectPlural({ one: 'song', other: 'songs' }, 1, 'en')).toBe('song');
    expect(selectPlural({ one: 'song', other: 'songs' }, 2, 'en')).toBe('songs');
  });

  it('falls back to the "other" form for categories a translation does not list', () => {
    // Spanish uses the "many" category for exact millions.
    expect(new Intl.PluralRules(intlTag('es')).select(1_000_000)).toBe('many');
    expect(formatCount(songs, 1_000_000, 'es')).toBe('1.000.000 cantos');
    expect(formatCount({ ...songs, many: (count: string) => `${count} de cantos` }, 1_000_000, 'es')).toBe('1.000.000 de cantos');
  });

  it('formats the number for the locale inside the phrase', () => {
    expect(formatCount(songs, 1, 'es')).toBe('1 canto');
    expect(formatCount(songs, 24, 'es')).toBe('24 cantos');
    expect(formatCount(songs, 1500, 'en')).toBe('1,500 cantos');
  });
});

describe('relative time', () => {
  // Local wall-clock dates keep the calendar-day cases independent of the machine's time zone.
  const now = new Date(2026, 9, 7, 1, 30);
  const minutesAgo = (minutes: number): Date => new Date(now.getTime() - minutes * 60_000);

  it('uses elapsed minutes and hours during the first day', () => {
    expect(relativeTime(minutesAgo(0.5), now)).toEqual({ value: 0, unit: 'second' });
    expect(relativeTime(minutesAgo(5), now)).toEqual({ value: -5, unit: 'minute' });
    expect(relativeTime(minutesAgo(170), now)).toEqual({ value: -2, unit: 'hour' });
  });

  it('counts calendar days after the first day, so yesterday is the previous date', () => {
    expect(relativeTime(new Date(2026, 9, 6, 0, 30), now)).toEqual({ value: -1, unit: 'day' });
    expect(relativeTime(new Date(2026, 9, 5, 19, 0), now)).toEqual({ value: -2, unit: 'day' });
  });

  it('switches to weeks, months and years for older moments, rounding down', () => {
    expect(relativeTime(new Date(2026, 8, 27, 12, 0), now)).toEqual({ value: -1, unit: 'week' });
    expect(relativeTime(new Date(2026, 7, 1, 12, 0), now)).toEqual({ value: -2, unit: 'month' });
    expect(relativeTime(new Date(2024, 9, 1, 12, 0), now)).toEqual({ value: -2, unit: 'year' });
  });

  it('reads a time ahead of this device as now', () => {
    expect(relativeTime(minutesAgo(-10), now)).toEqual({ value: 0, unit: 'second' });
  });

  it('uses the language words for adjacent days and the short units', () => {
    expect(formatRelativeTime(new Date(2026, 9, 6, 0, 0), now, 'es')).toBe('ayer');
    expect(formatRelativeTime(new Date(2026, 9, 6, 0, 0), now, 'en')).toBe('yesterday');
    expect(formatRelativeTime(minutesAgo(125), now, 'es')).toBe('hace 2 h');
  });
});
