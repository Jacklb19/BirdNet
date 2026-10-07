import type { Locale } from './locales';

/** One feature's texts in every supported language. */
export type MessageModule<T> = Readonly<Record<Locale, T>>;

/**
 * Declares a feature's messages. The Spanish entry defines the shape; every other language must provide
 * exactly the same keys, so a missing translation is a type error instead of a blank in the interface.
 * Values are strings or functions of already formatted values (numbers and dates are formatted by the
 * caller with the locale-aware formatters, so word order stays in the translation).
 */
export function defineMessages<T>(messages: { readonly es: T } & Readonly<Record<Exclude<Locale, 'es'>, NoInfer<T>>>): MessageModule<T> {
  return messages;
}
