import { createContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { shellDictionaries, type Messages } from './messages';

/** Whether the sections' texts arrived; the shell draws before them, the sections only after. */
export type SectionTexts = 'loading' | 'ready' | 'failed';

export interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  /**
   * Typed texts of the active language, one namespace per feature (dict.listen, dict.common…). Until `sections` is
   * 'ready' only the shell's namespaces (common, app, listen) are filled, which is all the shell reads; the app shows a
   * section only once its texts are there.
   */
  readonly dict: Messages;
  readonly sections: SectionTexts;
}

export const defaultContextValue: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  dict: shellDictionaries[DEFAULT_LOCALE] as Messages,
  sections: 'loading',
};

export const I18nContext = createContext<I18nContextValue>(defaultContextValue);
