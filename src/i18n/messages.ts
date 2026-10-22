import { appMessages } from '../app/i18n';
import { listenMessages } from '../features/listen/i18n';
import { commonMessages } from '../shared/i18n';
import type { MessageModule } from './defineMessages';
import { LOCALES, type Locale } from './locales';
import type { SECTION_MODULES } from './sectionMessages';

/**
 * Every feature owns its texts; this table only composes them under one namespace per feature. The shell (navigation,
 * live player, pocket mode, fallbacks) uses these; the sections' texts come in their own file (`sectionMessages.ts`).
 */
const SHELL_MODULES = {
  common: commonMessages,
  app: appMessages,
  listen: listenMessages,
} as const;

type Modules = typeof SHELL_MODULES & typeof SECTION_MODULES;
export type Messages = { readonly [K in keyof Modules]: Modules[K] extends MessageModule<infer T> ? T : never };
/** The texts the shell may read before the sections' file arrives. */
export type ShellMessages = Pick<Messages, keyof typeof SHELL_MODULES>;

/** One language of the given modules, one namespace each; the callers' types say which namespaces those are. */
function compose(modules: Readonly<Record<string, MessageModule<unknown>>>, locale: Locale): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(Object.entries(modules).map(([namespace, module]) => [namespace, module[locale]])));
}

export const shellDictionaries: Readonly<Record<Locale, ShellMessages>> = Object.freeze(
  Object.fromEntries(LOCALES.map(({ code }) => [code, compose(SHELL_MODULES, code) as ShellMessages])) as Record<Locale, ShellMessages>,
);

/** Every text of every language, given the sections' modules. */
export function composeDictionaries(sections: typeof SECTION_MODULES): Readonly<Record<Locale, Messages>> {
  return Object.freeze(Object.fromEntries(
    LOCALES.map(({ code }) => [code, compose({ ...SHELL_MODULES, ...sections }, code) as Messages]),
  ) as Record<Locale, Messages>);
}

let loading: Promise<Readonly<Record<Locale, Messages>>> | null = null;

/** Every text of every language; the first call downloads the sections' file, later ones reuse it. */
export function loadDictionaries(): Promise<Readonly<Record<Locale, Messages>>> {
  loading ??= import('./sectionMessages').then(({ SECTION_MODULES: sections }) => composeDictionaries(sections));
  return loading;
}
