import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPreferences, writePreference } from '../config/storage';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { I18nContext, type I18nContextValue } from './context';
import { loadDictionaries, shellDictionaries, type Messages } from './messages';

// Asked for while the app starts, before the first render, so the texts travel with the first section's code.
if (typeof window !== 'undefined') loadDictionaries().catch(() => undefined);

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
  const [dictionaries, setDictionaries] = useState<Readonly<Record<Locale, Messages>> | null>(null);
  const [failed, setFailed] = useState(false);

  // The sections' texts come in their own file, asked for at once so they arrive with the first section.
  useEffect(() => {
    let active = true;
    loadDictionaries().then((loaded) => { if (active) setDictionaries(loaded); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  // On mount too: index.html declares the default language, which is wrong when another one was stored.
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writePreference('locale', next);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale, setLocale,
    // Until then the shell's own texts are all there is, and the app shows no section (see SectionTexts).
    dict: dictionaries ? dictionaries[locale] : shellDictionaries[locale] as Messages,
    sections: dictionaries ? 'ready' : failed ? 'failed' : 'loading',
  }), [locale, setLocale, dictionaries, failed]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
