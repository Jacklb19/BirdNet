import { createContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { dictionaries, type Messages } from './messages';

export interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  /** Typed texts of the active language, one namespace per feature (dict.listen, dict.common…). */
  readonly dict: Messages;
}

export const defaultContextValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  dict: dictionaries[DEFAULT_LOCALE],
};

export const I18nContext = createContext<I18nContextValue>(defaultContextValue);
