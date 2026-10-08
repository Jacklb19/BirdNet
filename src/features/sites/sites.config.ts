import { DEFAULT_PERIOD, type Period } from '../../config/contract';

/** Period each card of the list summarizes: the one the panel opens with, so the numbers match after tapping a card. */
export const CARD_PERIOD: Period = DEFAULT_PERIOD;

/** Species photos on a card: enough to recognize a site at a glance while the row still fits a 360 px card. */
export const CARD_PHOTO_COUNT = 3;

/** Species listed before "See all": the list stays scannable and the export button stays within reach on a phone. */
export const SPECIES_PREVIEW_COUNT = 4;

/** Longest site-name part of an export file name, so the whole name stays well inside file-system limits. */
export const EXPORT_NAME_MAX_LENGTH = 40;

/** Used when a site name has no letters or digits to keep (for example, only emoji). */
export const EXPORT_FALLBACK_SLUG = 'site';

/**
 * Export file name: product, site and the local dates it covers (only the end for the whole record), so downloads
 * of several sites, periods and days sort well and never collide.
 */
export function exportFileName(siteSlug: string, fromIsoDate: string | null, toIsoDate: string): string {
  return fromIsoDate ? `birdnet-${siteSlug}-${fromIsoDate}_${toIsoDate}.csv` : `birdnet-${siteSlug}-${toIsoDate}.csv`;
}

/**
 * Browsers may read a download's object URL after the click returns, so it is released a little later
 * instead of immediately.
 */
export const DOWNLOAD_URL_RELEASE_MS = 1_000;

/**
 * A card asks for its statistics once it comes within this margin of the viewport (IntersectionObserver
 * `rootMargin`): numbers are ready when the person scrolls to it, and a long list does not query every site at once.
 */
export const CARD_STATS_PRELOAD_MARGIN = '50% 0%';
