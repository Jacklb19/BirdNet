import { appMessages } from '../app/i18n';
import { accountMessages } from '../features/account/i18n';
import { listenMessages } from '../features/listen/i18n';
import { logMessages } from '../features/log/i18n';
import { mapMessages } from '../features/map/i18n';
import { settingsMessages } from '../features/settings/i18n';
import { sitesMessages } from '../features/sites/i18n';
import { welcomeMessages } from '../features/welcome/i18n';
import { commonMessages } from '../shared/i18n';
import type { MessageModule } from './defineMessages';
import { LOCALES, type Locale } from './locales';

/** Every feature owns its texts; this table only composes them under one namespace per feature. */
const MODULES = {
  common: commonMessages,
  app: appMessages,
  listen: listenMessages,
  log: logMessages,
  map: mapMessages,
  sites: sitesMessages,
  account: accountMessages,
  settings: settingsMessages,
  welcome: welcomeMessages,
} as const;

type Modules = typeof MODULES;
export type Messages = { readonly [K in keyof Modules]: Modules[K] extends MessageModule<infer T> ? T : never };

function messagesFor(locale: Locale): Messages {
  const entries = Object.entries(MODULES).map(([namespace, module]: [string, MessageModule<unknown>]) => [namespace, module[locale]]);
  // The mapped type guarantees each namespace keeps its own shape; Object.fromEntries cannot express that.
  return Object.freeze(Object.fromEntries(entries)) as Messages;
}

export const dictionaries: Readonly<Record<Locale, Messages>> = Object.freeze(
  Object.fromEntries(LOCALES.map(({ code }) => [code, messagesFor(code)])) as Record<Locale, Messages>,
);
