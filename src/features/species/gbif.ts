import { useEffect, useState } from 'react';
import { config } from '../../config/env';

/**
 * The guide part of the species card, from GBIF (free, no key, open CORS): where the species sits in the
 * classification, its IUCN Red List category and the map of where it has been recorded. Nothing here is the person's
 * own data. The service worker keeps the classification and the category, so a card opened once also reads offline;
 * the map always needs the network.
 */
export interface Taxon {
  /** Key of the accepted species in the GBIF backbone: the Red List category and the range map are asked with it. */
  readonly key: number;
  readonly order: string;
  readonly family: string;
  readonly genus: string;
  /** The name GBIF matched, without authorship. */
  readonly canonicalName: string;
}

/** Red List categories the card can name; anything else GBIF may answer is shown as unknown. */
export const IUCN_CODES = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD', 'NE'] as const;
export type IucnCode = (typeof IUCN_CODES)[number];

/** The threat scale of the Red List, from the least to the most severe; DD and NE are outside it. */
export const IUCN_SCALE = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX'] as const satisfies readonly IucnCode[];

/** West, south, east, north in degrees. */
export type RangeBounds = readonly [number, number, number, number];

/** Where the species has been recorded: how many georeferenced records GBIF holds and the box that contains them. */
export interface RangeExtent {
  readonly records: number;
  /** Null when GBIF reports no box a map can frame (it then shows the world). */
  readonly bounds: RangeBounds | null;
}

/** Only a name GBIF knows exactly, as a species and as a bird, is trusted: a fuzzy or higher-rank match is another taxon. */
const EXACT_MATCH = 'EXACT';
const SPECIES_RANK = 'SPECIES';
const ANIMAL_KINGDOM = 'Animalia';
const BIRD_CLASS = 'Aves';
/** GBIF answers "no Red List entry for this taxon" with an empty 204. */
const NO_CONTENT = 204;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * Hexagon bins colored from yellow (few records) to red (many): saturated enough to read on the light and on the dark
 * basemap. The legend of the card (`species.card.range.legend`) names these colors, so change both together.
 */
const RANGE_TILE_STYLE = 'classic.poly';
/**
 * Hexagons across one tile. A tile is stretched up to twice its size before the next zoom level replaces it, so each
 * hexagon is 9 to 17 px on screen: fine enough to follow a mountain range on a phone-sized map.
 */
const RANGE_HEX_PER_TILE = 60;
/** Web Mercator, the projection of the basemap. */
const RANGE_TILE_SRS = 'EPSG:3857';
/** GBIF's `@1x` tiles are 512 px wide; `@2x` covers the same area with twice the pixels. */
export const RANGE_TILE_SIZE = 512;

/** GBIF's public site: the source credited by the map, and where each species has its own page. */
export const GBIF_SITE_URL = 'https://www.gbif.org';

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => (typeof value === 'object' && value !== null ? value as Row : null);
const isName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isKey = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isDegrees = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/** The class and kingdom are sent as hints, so a bird wins over a plant or an insect that shares its name. */
export function taxonMatchUrl(scientificName: string): string {
  const params = new URLSearchParams({ name: scientificName.trim(), kingdom: ANIMAL_KINGDOM, class: BIRD_CLASS });
  return `${config.gbif.apiUrl}/species/match?${params.toString()}`;
}

/** The species of a name-match answer, or null when the match is not an exact bird species or a field is missing. */
export function parseTaxon(body: unknown): Taxon | null {
  const row = asRow(body);
  if (!row || row.matchType !== EXACT_MATCH || row.rank !== SPECIES_RANK || row.kingdom !== ANIMAL_KINGDOM || row.class !== BIRD_CLASS) return null;
  // BirdNET's names follow another checklist, so some are synonyms in GBIF: its records hang from the accepted species.
  const key = row.acceptedUsageKey ?? row.usageKey;
  if (!isKey(key) || !isName(row.order) || !isName(row.family) || !isName(row.genus) || !isName(row.canonicalName)) return null;
  return { key, order: row.order.trim(), family: row.family.trim(), genus: row.genus.trim(), canonicalName: row.canonicalName.trim() };
}

/** The category code of a Red List answer; null for a code the card cannot name or a malformed body. */
export function parseIucnCode(body: unknown): IucnCode | null {
  const code = asRow(body)?.code;
  return IUCN_CODES.find((known) => known === code) ?? null;
}

/** The record count and bounding box of a map-capabilities answer; null when the count is missing. */
export function parseRangeExtent(body: unknown): RangeExtent | null {
  const row = asRow(body);
  if (!row || typeof row.total !== 'number' || !Number.isSafeInteger(row.total) || row.total < 0) return null;
  const { minLng: west, minLat: south, maxLng: east, maxLat: north } = row;
  // GBIF reports a box that crosses the antimeridian with longitudes beyond 180: the whole world is shown instead.
  const framed = isDegrees(west, MAX_LONGITUDE) && isDegrees(east, MAX_LONGITUDE) && isDegrees(south, MAX_LATITUDE) && isDegrees(north, MAX_LATITUDE) &&
    west <= east && south <= north;
  return { records: row.total, bounds: framed ? [west, south, east, north] : null };
}

/** The photo lookups' timeout also bounds these: both are small answers from a public API. */
function request(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(config.photos.requestTimeoutMs) });
}

/** The species GBIF knows by `scientificName`, or null when it has no reliable match; rejects when it could not be asked. */
export async function fetchTaxon(scientificName: string): Promise<Taxon | null> {
  const response = await request(taxonMatchUrl(scientificName));
  if (!response.ok) throw new Error('Taxon lookup failed.');
  return parseTaxon(await response.json());
}

/** The Red List category of the species; null (unknown) when GBIF has none or could not be asked: it is never guessed. */
export async function fetchConservation(key: number): Promise<IucnCode | null> {
  try {
    const response = await request(`${config.gbif.apiUrl}/species/${String(key)}/iucnRedListCategory`);
    if (!response.ok || response.status === NO_CONTENT) return null;
    return parseIucnCode(await response.json());
  } catch {
    return null;
  }
}

/** Where GBIF holds records of the species; null when it could not be asked (the map then shows the world). */
export async function fetchRangeExtent(key: number): Promise<RangeExtent | null> {
  try {
    const response = await request(`${config.gbif.tilesUrl}/capabilities.json?${new URLSearchParams({ taxonKey: String(key) }).toString()}`);
    return response.ok ? parseRangeExtent(await response.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Raster tile template (`{z}/{x}/{y}`) of the occurrence density of the species. `pixelRatio` 2 asks for the sharper
 * tiles of a high-density screen.
 */
export function rangeTileUrl(key: number, pixelRatio: 1 | 2 = 1): string {
  const params = new URLSearchParams({
    taxonKey: String(key), bin: 'hex', hexPerTile: String(RANGE_HEX_PER_TILE), style: RANGE_TILE_STYLE, srs: RANGE_TILE_SRS,
  });
  return `${config.gbif.tilesUrl}/{z}/{x}/{y}@${String(pixelRatio)}x.png?${params.toString()}`;
}

/** Page of the species on GBIF, linked under the map as the source of its records. */
export function gbifSpeciesUrl(key: number): string {
  return `${GBIF_SITE_URL}/species/${String(key)}`;
}

export type TaxonState =
  | { readonly status: 'loading' | 'none' | 'unavailable' }
  /** `conservation` is `pending` while the Red List is asked and null when the category is unknown. */
  | { readonly status: 'loaded'; readonly taxon: Taxon; readonly conservation: IucnCode | 'pending' | null };

/** `none`: GBIF has no reliable match for the name; `unavailable`: it could not be reached (offline and never read before). */
export function useTaxon(scientificName: string): TaxonState {
  const [state, setState] = useState<{ readonly key: string; readonly value: TaxonState } | null>(null);
  useEffect(() => {
    let active = true;
    const show = (value: TaxonState): void => { if (active) setState({ key: scientificName, value }); };
    fetchTaxon(scientificName)
      .then(async (taxon) => {
        if (!taxon) { show({ status: 'none' }); return; }
        // The classification and the map do not wait for the Red List answer.
        show({ status: 'loaded', taxon, conservation: 'pending' });
        show({ status: 'loaded', taxon, conservation: await fetchConservation(taxon.key) });
      })
      .catch(() => { show({ status: 'unavailable' }); });
    return () => { active = false; };
  }, [scientificName]);
  return state?.key === scientificName ? state.value : { status: 'loading' };
}
