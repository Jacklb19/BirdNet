import type { Locale } from '../../i18n/locales';
import { searchKey } from '../species/album';
import { commonName } from '../species/speciesNames';
import { SPECIES_SEARCH_MIN_CHARS } from './review.config';

export interface SpeciesMatch {
  readonly scientificName: string;
  /** Common name in the interface language (or its fallback). */
  readonly name: string;
}

/**
 * Species of the model whose common or scientific name contains what the person typed, without regard to case
 * or accents. Names that start with it come first, then alphabetically, so "mirlo" lists the mirlos before the
 * birds that merely have it inside their name.
 */
export function searchSpecies(names: Readonly<Record<string, readonly string[]>>, query: string, locale: Locale, limit: number): SpeciesMatch[] {
  const key = searchKey(query);
  if (key.length < SPECIES_SEARCH_MIN_CHARS) return [];
  const matches: (SpeciesMatch & { readonly leading: boolean })[] = [];
  for (const scientificName of Object.keys(names)) {
    const name = commonName(names, scientificName, locale);
    const nameKey = searchKey(name);
    const scientificKey = searchKey(scientificName);
    if (!nameKey.includes(key) && !scientificKey.includes(key)) continue;
    matches.push({ scientificName, name, leading: nameKey.startsWith(key) || scientificKey.startsWith(key) });
  }
  return matches
    .sort((left, right) => Number(right.leading) - Number(left.leading) || left.name.localeCompare(right.name, locale))
    .slice(0, limit)
    .map(({ scientificName, name }) => ({ scientificName, name }));
}
