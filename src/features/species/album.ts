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
