/** The album as plain data: one sticker per species the person recorded, on this phone or in the account. */
import type { OwnSpecies } from '../account/profileApi';
import type { LogRecord } from '../log/logRecords';

export interface AlbumEntry {
  readonly species: string;
  readonly detections: number;
  readonly bestConfidence: number;
  /** Epoch milliseconds of the latest record. */
  readonly lastAt: number;
}

/**
 * Species from the phone's log and from the account's cloud list, merged by scientific name. For a species in both,
 * the larger count and the later date win: the phone may hold records not uploaded yet, the cloud those of other devices.
 */
export function albumEntries(local: readonly LogRecord[], cloud: readonly OwnSpecies[] | null): AlbumEntry[] {
  const bySpecies = new Map<string, AlbumEntry>();
  const merge = (entry: AlbumEntry): void => {
    const current = bySpecies.get(entry.species);
    bySpecies.set(entry.species, current ? {
      species: entry.species,
      detections: Math.max(current.detections, entry.detections),
      bestConfidence: Math.max(current.bestConfidence, entry.bestConfidence),
      lastAt: Math.max(current.lastAt, entry.lastAt),
    } : entry);
  };
  const phone = new Map<string, AlbumEntry>();
  for (const record of local) {
    const current = phone.get(record.species);
    phone.set(record.species, {
      species: record.species,
      detections: (current?.detections ?? 0) + 1,
      bestConfidence: Math.max(current?.bestConfidence ?? 0, record.confidence),
      lastAt: Math.max(current?.lastAt ?? 0, record.recordedAt),
    });
  }
  for (const entry of phone.values()) merge(entry);
  for (const row of cloud ?? []) {
    merge({ species: row.species, detections: row.detections, bestConfidence: row.bestConfidence, lastAt: Date.parse(row.lastRecordedAt) });
  }
  return [...bySpecies.values()].sort((a, b) => b.lastAt - a.lastAt || a.species.localeCompare(b.species));
}

/** Lower case without accents, so "colibri" finds "Colibrí" and "turdus" finds "Turdus fuscater". */
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().trim();
}

/** Whether a species matches a search, by its common name in the interface language or its scientific name. */
export function matchesSearch(query: string, scientificName: string, commonName: string): boolean {
  const key = searchKey(query);
  return !key || searchKey(scientificName).includes(key) || searchKey(commonName).includes(key);
}

/** Which stickers the album shows: every slot, the ones already pasted in, or the ones still to find. */
export const ALBUM_SCOPES = Object.freeze(['all', 'found', 'missing'] as const);
export type AlbumScope = (typeof ALBUM_SCOPES)[number];

/** A likely bird of the area, as the geographic model reports it. */
export interface LikelySpecies {
  readonly scientificName: string;
  /** English label of the model, used only when no localized name exists. */
  readonly commonName: string;
  readonly probability: number;
}

/** One place for a sticker: a recorded species, or a likely one of the area still to find. */
export type AlbumSlot =
  | { readonly found: true; readonly species: string; readonly entry: AlbumEntry }
  | { readonly found: false; readonly species: string; readonly label: string; readonly probability: number };

/**
 * The album's slots in reading order: what the person has recorded first (latest first, as `albumEntries` gives
 * it), then the likely birds of the area they have not recorded, likeliest first. A species never appears twice.
 */
export function albumSlots(entries: readonly AlbumEntry[], likely: readonly LikelySpecies[], scope: AlbumScope): AlbumSlot[] {
  const collected = new Set(entries.map((entry) => entry.species));
  const found: AlbumSlot[] = scope === 'missing' ? [] : entries.map((entry) => ({ found: true, species: entry.species, entry }));
  const missing: AlbumSlot[] = scope === 'found' ? [] : likely
    .filter((species) => !collected.has(species.scientificName))
    .sort((a, b) => b.probability - a.probability || a.scientificName.localeCompare(b.scientificName))
    .map((species) => ({ found: false, species: species.scientificName, label: species.commonName, probability: species.probability }));
  return [...found, ...missing];
}

export interface AlbumPageView<T> {
  /** Page actually shown (1-based): the requested one, brought back into range. */
  readonly page: number;
  readonly pages: number;
  readonly slots: readonly T[];
}

/** One page of the album. An empty album still has its first page. */
export function albumPage<T>(slots: readonly T[], page: number, size: number): AlbumPageView<T> {
  const pages = Math.max(1, Math.ceil(slots.length / size));
  const shown = Math.min(pages, Math.max(1, Math.trunc(page) || 1));
  return { page: shown, pages, slots: slots.slice((shown - 1) * size, shown * size) };
}
