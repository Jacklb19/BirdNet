import { createContext } from 'react';
import type { Locale, TranslationSchema } from './types';
import { es } from './es';
import { en } from './en';

export const dictionaries: Record<Locale, TranslationSchema> = { es, en };

export function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return path;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  dict: TranslationSchema;
}

export const defaultContextValue: I18nContextValue = {
  locale: 'es',
  setLocale: () => {},
  t: (key: string) => getNestedValue(dictionaries.es as unknown as Record<string, unknown>, key),
  dict: es,
};

export const I18nContext = createContext<I18nContextValue>(defaultContextValue);
