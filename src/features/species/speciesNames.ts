import { useEffect, useState } from 'react';
import { config } from '../../config/env';
import type { Locale } from '../../i18n/locales';

/**
 * Written by scripts/build-species-names.mjs and precached by the service worker; the file name mirrors
 * MODEL_FILES.speciesNames in build.config.mjs (checked by species.test.ts).
 */
export const SPECIES_NAMES_URL = `${config.modelAssetsBaseUrl}/species-names.json`;

/**
 * Column of each language in a name tuple, in the order the build script writes them. Typed by `Locale`, so
 * adding a language does not compile until its column exists.
 */
const NAME_COLUMN: Readonly<Record<Locale, number>> = Object.freeze({ es: 0, en: 1 });

/** English names come from the model labels themselves, so that column is always filled. */
const FALLBACK_LOCALE: Locale = 'en';

/** Scientific name to localized common names; an empty entry means no name in that language. */
type NameTable = Record<string, readonly string[]>;

let table: NameTable | null = null;
let loading: Promise<NameTable> | null = null;

/** Loaded once per page and precached by the service worker, so names work offline. */
export function loadSpeciesNames(): Promise<NameTable> {
  if (table) return Promise.resolve(table);
  loading ??= fetch(SPECIES_NAMES_URL)
    .then((response) => { if (!response.ok) throw new Error('Species names unavailable.'); return response.json() as Promise<unknown>; })
    .then((body) => {
      const names = (body as { names?: unknown }).names;
      if (!names || typeof names !== 'object') throw new Error('Invalid species names.');
      table = names as NameTable;
      return table;
    })
    .catch((error: unknown) => { loading = null; throw error; });
  return loading;
}

/** Common name in the active language; the scientific name is the last resort, never an invented translation. */
export function commonName(names: NameTable | null, scientificName: string, locale: Locale, fallback?: string): string {
  const entry = names?.[scientificName];
  if (entry) return entry[NAME_COLUMN[locale]] || entry[NAME_COLUMN[FALLBACK_LOCALE]] || scientificName;
  return fallback || scientificName;
}

export function useSpeciesNames(): NameTable | null {
  const [names, setNames] = useState<NameTable | null>(table);
  useEffect(() => {
    if (names) return;
    let active = true;
    // Without the table the UI shows scientific names; there is nothing else to recover.
    loadSpeciesNames().then((loaded) => { if (active) setNames(loaded); }).catch(() => undefined);
    return () => { active = false; };
  }, [names]);
  return names;
}
