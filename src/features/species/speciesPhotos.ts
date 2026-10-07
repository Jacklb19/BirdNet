import { useEffect, useState } from 'react';
import { config } from '../../config/env';
import { STORAGE_KEYS } from '../../config/storage';
import { isSpeciesPhotoUrl } from '../offline/photoCache';

export interface SpeciesPhoto {
  readonly url: string;
  /** Null when Commons credits nobody; the interface then shows its own translated credit line. */
  readonly author: string | null;
  readonly license: string;
}

/** `--photo-hero` of src/styles/tokens.css, in rem: the largest box a photo fills (species.test.ts keeps both equal). */
export const PHOTO_HERO_REM = 18;

/** CSS pixels per rem at the browsers' default root font size. */
const DEFAULT_ROOT_FONT_PX = 16;

/** Device pixels per CSS pixel the thumbnail is sized for, so it stays sharp on high-density phone screens. */
const THUMBNAIL_PIXEL_DENSITY = 2;

/**
 * Requested thumbnail width in pixels: the hero box at twice the density; rows (--photo-row) and avatars are
 * smaller and reuse it. Part of every cached entry, so changing it refetches the photos instead of serving the old size.
 */
export const THUMBNAIL_WIDTH_PX = PHOTO_HERO_REM * DEFAULT_ROOT_FONT_PX * THUMBNAIL_PIXEL_DENSITY;

/**
 * MediaWiki Action API requests (https://www.mediawiki.org/wiki/API:Query). `origin: '*'` is what allows an
 * anonymous cross-origin call; `redirects` resolves synonyms to the article that holds the photo.
 */
const MEDIAWIKI = Object.freeze({
  common: Object.freeze({ format: 'json', origin: '*' }),
  pageImage: Object.freeze({ action: 'query', prop: 'pageimages', piprop: 'name', redirects: '1' }),
  imageInfo: Object.freeze({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata' }),
  /** Namespace of media files: the page image is a bare file name, the metadata query needs the full title. */
  fileNamespace: 'File:',
});

/**
 * Bump when the shape or the meaning of a cached entry changes; entries written by another version are looked up
 * again. Version 2 also stored rejected image hosts as absences, so its null entries must not be trusted.
 */
const PHOTO_CACHE_VERSION = 3;

interface CachedPhoto {
  readonly version: number;
  readonly width: number;
  /** Null records a confirmed absence, so species without a photo are not looked up on every visit. */
  readonly photo: SpeciesPhoto | null;
}

/**
 * A lookup that gave no usable answer (unexpected response, image host outside the allowed list). Unlike a
 * confirmed absence it is never cached, so the photo is looked up again on the next visit.
 */
export class PhotoLookupError extends Error {}

const memory = new Map<string, SpeciesPhoto | null>();
const inflight = new Map<string, Promise<SpeciesPhoto | null>>();

function stripHtml(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
}

/**
 * Lead image file of the Wikipedia article for a scientific name, or null when the article has none (a confirmed
 * absence). An answer without pages, such as the error object MediaWiki returns with HTTP 200 when it is
 * rate limited, says nothing about the species, so it throws `PhotoLookupError` and is never cached.
 */
export function parsePageImage(body: unknown): string | null {
  const pages = (body as { query?: { pages?: Record<string, { pageimage?: unknown }> } } | null)?.query?.pages;
  if (!pages) throw new PhotoLookupError('Unexpected page information.');
  for (const page of Object.values(pages)) if (typeof page.pageimage === 'string' && page.pageimage) return page.pageimage;
  return null;
}

interface ImageInfoPage {
  readonly missing?: unknown;
  readonly imageinfo?: readonly { readonly thumburl?: unknown; readonly extmetadata?: Record<string, { readonly value?: unknown } | undefined> }[];
}

/**
 * Thumbnail plus credit, or null for a confirmed absence: the file is not on Commons, or it has no license to
 * credit. Images outside `config.photos.allowedImageHosts` (the rule the service worker uses to cache photos, so
 * every accepted photo can also be kept for offline use) and malformed answers throw `PhotoLookupError` instead:
 * they say nothing about whether the species has a photo.
 */
export function parseImageInfo(body: unknown): SpeciesPhoto | null {
  const pages = (body as { query?: { pages?: Record<string, ImageInfoPage | undefined> } } | null)?.query?.pages;
  const page = pages ? Object.values(pages)[0] : undefined;
  if (page && 'missing' in page) return null;
  const info = page?.imageinfo?.[0];
  if (!info || typeof info.thumburl !== 'string') throw new PhotoLookupError('Unexpected image information.');
  let url: URL;
  try { url = new URL(info.thumburl); } catch { throw new PhotoLookupError('Invalid image URL.'); }
  if (!isSpeciesPhotoUrl(url)) throw new PhotoLookupError(`Image host ${url.hostname} is not allowed.`);
  const license = stripHtml(info.extmetadata?.LicenseShortName?.value);
  const author = stripHtml(info.extmetadata?.Artist?.value);
  if (!license) return null;
  return { url: url.href, author: author || null, license };
}

function isPhoto(value: unknown): value is SpeciesPhoto {
  const photo = value as Partial<Record<keyof SpeciesPhoto, unknown>> | null;
  return !!photo && typeof photo.url === 'string' && typeof photo.license === 'string' &&
    (photo.author === null || typeof photo.author === 'string');
}

export function serializeCachedPhoto(photo: SpeciesPhoto | null): string {
  const entry: CachedPhoto = { version: PHOTO_CACHE_VERSION, width: THUMBNAIL_WIDTH_PX, photo };
  return JSON.stringify(entry);
}

/** `undefined` means "not cached" (missing, corrupted or from another version), unlike a cached `null`. */
export function parseCachedPhoto(raw: string): SpeciesPhoto | null | undefined {
  try {
    const entry = JSON.parse(raw) as Partial<Record<keyof CachedPhoto, unknown>> | null;
    if (!entry || entry.version !== PHOTO_CACHE_VERSION || entry.width !== THUMBNAIL_WIDTH_PX) return undefined;
    if (entry.photo === null) return null;
    return isPhoto(entry.photo) ? { url: entry.photo.url, author: entry.photo.author, license: entry.photo.license } : undefined;
  } catch { return undefined; }
}

function readStored(scientificName: string): SpeciesPhoto | null | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.photoPrefix + scientificName);
    return raw === null ? undefined : parseCachedPhoto(raw);
  } catch { return undefined; }
}

function store(scientificName: string, photo: SpeciesPhoto | null): void {
  try { localStorage.setItem(STORAGE_KEYS.photoPrefix + scientificName, serializeCachedPhoto(photo)); } catch { /* Storage may be full or disabled; the photo is fetched again next time. */ }
}

async function getJson(base: string, params: Readonly<Record<string, string>>): Promise<unknown> {
  const url = `${base}?${new URLSearchParams({ ...MEDIAWIKI.common, ...params }).toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(config.photos.requestTimeoutMs) });
  if (!response.ok) throw new Error('Photo lookup failed.');
  return response.json();
}

/**
 * Looks the photo up once; a confirmed absence (no page image, file not on Commons, no license) is remembered.
 * Network failures and unusable answers reject without caching anything, so they are retried on the next visit.
 */
export function fetchSpeciesPhoto(scientificName: string): Promise<SpeciesPhoto | null> {
  if (memory.has(scientificName)) return Promise.resolve(memory.get(scientificName) ?? null);
  const stored = readStored(scientificName);
  if (stored !== undefined) { memory.set(scientificName, stored); return Promise.resolve(stored); }
  const pending = inflight.get(scientificName);
  if (pending) return pending;
  const lookup = (async () => {
    const file = parsePageImage(await getJson(config.photos.lookupApiUrl, { ...MEDIAWIKI.pageImage, titles: scientificName }));
    const photo = file ? parseImageInfo(await getJson(config.photos.metadataApiUrl, {
      ...MEDIAWIKI.imageInfo, iiurlwidth: String(THUMBNAIL_WIDTH_PX), titles: `${MEDIAWIKI.fileNamespace}${file}`,
    })) : null;
    memory.set(scientificName, photo);
    store(scientificName, photo);
    return photo;
  })().finally(() => { inflight.delete(scientificName); });
  inflight.set(scientificName, lookup);
  return lookup;
}

interface FoundPhoto {
  readonly scientificName: string;
  readonly photo: SpeciesPhoto | null;
}

export function useSpeciesPhoto(scientificName: string | null): SpeciesPhoto | null {
  const [found, setFound] = useState<FoundPhoto | null>(null);
  useEffect(() => {
    if (!scientificName) return;
    let active = true;
    // Offline or lookup errors leave the neutral placeholder; nothing else depends on the photo.
    fetchSpeciesPhoto(scientificName).then((photo) => { if (active) setFound({ scientificName, photo }); }).catch(() => undefined);
    return () => { active = false; };
  }, [scientificName]);
  if (!scientificName) return null;
  // A result belongs to the species it was looked up for: when the species changes (the bird singing now, say),
  // the previous bird's photo and credit never stay under the new name while its own lookup runs.
  return found?.scientificName === scientificName ? found.photo : memory.get(scientificName) ?? null;
}
