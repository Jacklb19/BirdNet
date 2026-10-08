/**
 * Supported interface languages. Adding one here makes every message module fail to type-check until it
 * is translated. `intlTag` drives number and date formatting; `nativeName` is shown in the language picker
 * in its own language, as is conventional.
 */
export const LOCALES = Object.freeze([
  { code: 'es', intlTag: 'es-CO', nativeName: 'Español' },
  { code: 'en', intlTag: 'en-US', nativeName: 'English' },
] as const);

export type Locale = (typeof LOCALES)[number]['code'];

export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.code === value);
}

export function intlTag(locale: Locale): string {
  return LOCALES.find((entry) => entry.code === locale)?.intlTag ?? LOCALES[0].intlTag;
}
