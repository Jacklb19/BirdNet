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
 * or accents. The birds likely at the place come first: the one the person heard is almost always among them, and
 * the catalogue holds thousands from other continents. Within each group, names that start with the text precede
 * those that merely contain it, then alphabetically.
 *
 * @param likely Scientific names of the birds expected at the place, when known.
 */
export function searchSpecies(
  names: Readonly<Record<string, readonly string[]>>, query: string, locale: Locale, limit: number, likely: ReadonlySet<string> = new Set(),
): SpeciesMatch[] {
  const key = searchKey(query);
  if (key.length < SPECIES_SEARCH_MIN_CHARS) return [];
  const matches: (SpeciesMatch & { readonly leading: boolean; readonly likely: boolean })[] = [];
  for (const scientificName of Object.keys(names)) {
    const name = commonName(names, scientificName, locale);
    const nameKey = searchKey(name);
    const scientificKey = searchKey(scientificName);
    if (!nameKey.includes(key) && !scientificKey.includes(key)) continue;
    matches.push({ scientificName, name, leading: nameKey.startsWith(key) || scientificKey.startsWith(key), likely: likely.has(scientificName) });
  }
  return matches
    .sort((left, right) => Number(right.likely) - Number(left.likely) || Number(right.leading) - Number(left.leading) || left.name.localeCompare(right.name, locale))
    .slice(0, limit)
    .map(({ scientificName, name }) => ({ scientificName, name }));
}
