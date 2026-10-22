import { accountMessages } from '../features/account/i18n';
import { homeMessages } from '../features/home/i18n';
import { logMessages } from '../features/log/i18n';
import { mapMessages } from '../features/map/i18n';
import { settingsMessages } from '../features/settings/i18n';
import { sitesMessages } from '../features/sites/i18n';
import { speciesMessages } from '../features/species/i18n';
import { walkMessages } from '../features/walk/i18n';

/**
 * Texts of the sections, which load as their own file in parallel with the first screen (S11): the shell, which
 * draws before them, only uses those in `messages.ts`.
 */
export const SECTION_MODULES = {
  log: logMessages,
  map: mapMessages,
  sites: sitesMessages,
  account: accountMessages,
  settings: settingsMessages,
  home: homeMessages,
  species: speciesMessages,
  walk: walkMessages,
} as const;
