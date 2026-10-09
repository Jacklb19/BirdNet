import { useCallback, useState } from 'react';
import { STORAGE_KEYS } from '../../config/storage';
import type { Locale } from '../../i18n/locales';
import type { RegionSpecies } from '../inference/regionSpecies';
import { GUIDE_CONCURRENCY } from './species.config';
import { fetchSpeciesPhoto } from './speciesPhotos';
import { fetchSpeciesSummary } from './speciesSummary';

/**
 * The optional regional guide (ADR-17, ADR-19): one button stores the photo and the description of the region's
 * likely birds, so their cards open without signal. Everything goes through the same service-worker caches as the
 * cards people open, so nothing is stored twice and nothing has to be repeated later.
 */
export interface SavedGuide {
  /** Place the guide was saved for (its cell, as `lat,lon`). */
  readonly place: string;
  readonly species: number;
  /** Epoch milliseconds. */
  readonly savedAt: number;
}

export function guidePlace(location: { readonly latitude: number; readonly longitude: number }): string {
  return `${String(location.latitude)},${String(location.longitude)}`;
}

export function readSavedGuide(): SavedGuide | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.guide) ?? 'null') as Partial<SavedGuide> | null;
    if (!value || typeof value.place !== 'string' || typeof value.species !== 'number' || typeof value.savedAt !== 'number') return null;
    return { place: value.place, species: value.species, savedAt: value.savedAt };
  } catch { return null; }
}

function writeSavedGuide(guide: SavedGuide): void {
  try { localStorage.setItem(STORAGE_KEYS.guide, JSON.stringify(guide)); } catch { /* The guide is cached anyway; only the note is lost. */ }
}

/** Stores one species: the photo lookup, the image itself (the service worker keeps it) and the summary. */
async function saveSpecies(species: RegionSpecies, locale: Locale): Promise<void> {
  const photo = await fetchSpeciesPhoto(species.scientificName);
  if (photo) {
    const response = await fetch(photo.url, { mode: 'cors' });
    if (!response.ok) throw new Error('Photo unavailable.');
    await response.arrayBuffer();
  }
  await fetchSpeciesSummary(species.scientificName, locale);
}

/** Runs `task` over `items` with at most `limit` in flight; failures are counted, never thrown. */
export async function eachLimited<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>, onDone: (failed: boolean) => void): Promise<void> {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      if (item === undefined) return;
      try { await task(item); onDone(false); } catch { onDone(true); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

export type GuideProgress =
  | { readonly status: 'idle' }
  | { readonly status: 'saving'; readonly done: number; readonly total: number }
  | { readonly status: 'saved'; readonly saved: number; readonly failed: number };

export function useRegionGuide(locale: Locale): { readonly progress: GuideProgress; readonly saved: SavedGuide | null; readonly save: (place: string, species: readonly RegionSpecies[]) => Promise<void> } {
  const [progress, setProgress] = useState<GuideProgress>({ status: 'idle' });
  const [saved, setSaved] = useState<SavedGuide | null>(readSavedGuide);
  const save = useCallback(async (place: string, species: readonly RegionSpecies[]): Promise<void> => {
    let done = 0;
    let failed = 0;
    setProgress({ status: 'saving', done, total: species.length });
    await eachLimited(species, GUIDE_CONCURRENCY, (item) => saveSpecies(item, locale), (itemFailed) => {
      done += 1;
      if (itemFailed) failed += 1;
      setProgress({ status: 'saving', done, total: species.length });
    });
    const guide = { place, species: species.length - failed, savedAt: Date.now() };
    writeSavedGuide(guide);
    setSaved(guide);
    setProgress({ status: 'saved', saved: guide.species, failed });
  }, [locale]);
  return { progress, saved, save };
}
