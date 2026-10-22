import { composeDictionaries } from './messages';
import { SECTION_MODULES } from './sectionMessages';

/**
 * Every text of every language at once, for tests and tools that read labels without rendering the app. The app itself
 * never imports this module: it loads the sections' texts apart (`loadDictionaries`).
 */
export const dictionaries = composeDictionaries(SECTION_MODULES);
