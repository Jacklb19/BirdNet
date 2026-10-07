import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, readPreferences } from '../config/storage';
import {
  formatBytes,
  formatDate,
  formatDecibels,
  formatDecimal,
  formatFrequency,
  formatMilliseconds,
  formatPercent,
  formatSeconds,
} from './formatters';
import { I18nProvider } from './I18nProvider';
import { DEFAULT_LOCALE, LOCALES } from './locales';
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
});
