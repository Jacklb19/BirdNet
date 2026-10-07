import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, readPreferences } from '../config/storage';
import { es } from './es';
import { en } from './en';
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
import { useI18n } from './useI18n';

/** Validates that all nested string fields in an object are defined and non-empty. */
function assertAllKeysNonEmpty(obj: Record<string, unknown>, prefix = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      assertAllKeysNonEmpty(value as Record<string, unknown>, fullPath);
    } else {
      expect(typeof value, `Key ${fullPath} must be a string`).toBe('string');
      expect((value as string).trim().length, `Key ${fullPath} must not be empty`).toBeGreaterThan(0);
    }
  }
}

/** Validates that target has all keys present in reference. */
function assertKeyParity(refObj: Record<string, unknown>, targetObj: Record<string, unknown>, prefix = ''): void {
  for (const key of Object.keys(refObj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    expect(targetObj, `Missing key in translation: ${fullPath}`).toHaveProperty(key);
    if (typeof refObj[key] === 'object' && refObj[key] !== null) {
      assertKeyParity(refObj[key] as Record<string, unknown>, targetObj[key] as Record<string, unknown>, fullPath);
    }
  }
}

describe('dictionaries', () => {
  it('fills every Spanish key', () => {
    assertAllKeysNonEmpty(es as unknown as Record<string, unknown>);
  });

  it('gives English the same keys as Spanish, all filled', () => {
    assertKeyParity(es as unknown as Record<string, unknown>, en as unknown as Record<string, unknown>);
    assertAllKeysNonEmpty(en as unknown as Record<string, unknown>);
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
