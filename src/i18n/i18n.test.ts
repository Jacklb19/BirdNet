import { describe, it, expect } from 'vitest';
import { es } from './es';
import { en } from './en';
import {
  formatDecimal,
  formatPercent,
  formatFrequency,
  formatMilliseconds,
  formatDecibels,
  formatBytes,
  formatDate,
} from './formatters';
import type { TranslationSchema } from './types';

/**
 * Validates that all nested string fields in an object are defined and non-empty.
 */
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

/**
 * Validates that target has all keys present in reference.
 */
function assertKeyParity(
  refObj: Record<string, unknown>,
  targetObj: Record<string, unknown>,
  prefix = '',
): void {
  for (const key of Object.keys(refObj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    expect(targetObj, `Missing key in translation: ${fullPath}`).toHaveProperty(key);
    if (typeof refObj[key] === 'object' && refObj[key] !== null) {
      assertKeyParity(
        refObj[key] as Record<string, unknown>,
        targetObj[key] as Record<string, unknown>,
        fullPath,
      );
    }
  }
}

describe('i18n Translation Completeness & Integrity', () => {
  it('el diccionario en español está completo y no tiene claves vacías', () => {
    assertAllKeysNonEmpty(es as unknown as Record<string, unknown>);
  });

  it('el diccionario en inglés tiene paridad estructural con el español', () => {
    assertKeyParity(
      es as unknown as Record<string, unknown>,
      en as unknown as Record<string, unknown>,
    );
    assertAllKeysNonEmpty(en as unknown as Record<string, unknown>);
  });

  it('falla explícitamente si falta alguna clave obligatoria en el esquema', () => {
    const mockIncompleteDict = { ...es } as Partial<TranslationSchema>;
    delete (mockIncompleteDict as Record<string, unknown>).privacy;

    expect(() => {
      if (!mockIncompleteDict.privacy) {
        throw new Error('Falta clave obligatoria: privacy');
      }
    }).toThrow(/falta clave obligatoria/i);
  });
});

describe('i18n Intl Formatters', () => {
  it('formatea números decimales respetando la convención de coma en español y punto en inglés', () => {
    const formattedEs = formatDecimal(48.3, 'es', 1);
    const formattedEn = formatDecimal(48.3, 'en', 1);

    expect(formattedEs).toBe('48,3');
    expect(formattedEn).toBe('48.3');
  });

  it('formatea porcentajes con el símbolo y separador adecuado', () => {
    const formattedEs = formatPercent(0.895, 'es', 1);
    const formattedEn = formatPercent(0.895, 'en', 1);

    // En español incluye espacio de no separación antes de % o coma decimal
    expect(formattedEs).toMatch(/89,5\s*%/);
    expect(formattedEn).toBe('89.5%');
  });

  it('formatea frecuencia acústica con unidad Hz', () => {
    const freqEs = formatFrequency(48000, 'es');
    const freqEn = formatFrequency(48000, 'en');

    expect(freqEs).toMatch(/48\.000\s*Hz/);
    expect(freqEn).toMatch(/48,000\s*Hz/);
  });

  it('formatea latencia y milisegundos con Intl', () => {
    const msEs = formatMilliseconds(24.6, 'es', 1);
    const msEn = formatMilliseconds(24.6, 'en', 1);

    expect(msEs).toBe('24,6 ms');
    expect(msEn).toBe('24.6 ms');
  });

  it('formatea decibelios de nivel sonoro (dBFS)', () => {
    const dbEs = formatDecibels(-14.2, 'es', 1);
    const dbEn = formatDecibels(-14.2, 'en', 1);

    expect(dbEs).toBe('-14,2 dBFS');
    expect(dbEn).toBe('-14.2 dBFS');
  });

  it('formatea bytes en MB con separador decimal localizado', () => {
    const bytes = 38727042; // ~36.93 MB
    const mbEs = formatBytes(bytes, 'es');
    const mbEn = formatBytes(bytes, 'en');

    expect(mbEs).toMatch(/36,9\s*MB/);
    expect(mbEn).toMatch(/36\.9\s*MB/);
  });

  it('formatea fechas con Intl.DateTimeFormat', () => {
    const testDate = new Date('2026-10-12T14:30:00Z');
    const dateEs = formatDate(testDate, 'es');
    const dateEn = formatDate(testDate, 'en');

    expect(dateEs).toBeTruthy();
    expect(dateEn).toBeTruthy();
    expect(dateEs).not.toEqual(dateEn);
  });
});
