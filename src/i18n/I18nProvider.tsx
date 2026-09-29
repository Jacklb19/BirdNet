import {
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { Locale } from './types';
import {
  I18nContext,
  dictionaries,
  getNestedValue,
  type I18nContextValue,
} from './context';

const STORAGE_KEY = 'birdnet_settings';

interface StoredSettings {
  locale?: Locale;
  theme?: string;
}

function loadStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredSettings;
      if (parsed.locale === 'es' || parsed.locale === 'en') {
        return parsed.locale;
      }
    }
  } catch {
    // Private browsing or quota exceeded
  }
  return 'es';
}

function saveLocale(locale: Locale): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const current: StoredSettings = raw ? (JSON.parse(raw) as StoredSettings) : {};
    current.locale = locale;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Silently ignore storage errors
  }
}

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? loadStoredLocale());

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocale(newLocale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      return getNestedValue(
        dictionaries[locale] as unknown as Record<string, unknown>,
        key,
      );
    },
    [locale],
  );

  const dict = dictionaries[locale];

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, dict }),
    [locale, setLocale, t, dict],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
