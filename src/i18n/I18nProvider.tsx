import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPreferences, writePreference } from '../config/storage';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { I18nContext, dictionaries, getNestedValue, type I18nContextValue } from './context';

function readStoredLocale(): Locale {
  const { locale } = readPreferences();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export interface I18nProviderProps {
  children: ReactNode;
  /** Overrides the stored language; used by tests and previews. */
  initialLocale?: Locale;
}

/** Owns the interface language, persists it and keeps the document's `lang` in step for assistive technology. */
export function I18nProvider({ children, initialLocale }: I18nProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? readStoredLocale());

  // On mount too: index.html declares the default language, which is wrong when another one was stored.
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writePreference('locale', next);
  }, []);

  const t = useCallback(
    (key: string): string => getNestedValue(dictionaries[locale] as unknown as Record<string, unknown>, key),
    [locale],
  );

  const dict = dictionaries[locale];

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t, dict }), [locale, setLocale, t, dict]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
