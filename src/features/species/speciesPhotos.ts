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

/** Bump when the shape of a cached entry changes; entries written by another version are looked up again. */
const PHOTO_CACHE_VERSION = 2;

interface CachedPhoto {
  readonly version: number;
  readonly width: number;
  /** Null records a confirmed absence, so species without a photo are not looked up on every visit. */
  readonly photo: SpeciesPhoto | null;
}

const memory = new Map<string, SpeciesPhoto | null>();
const inflight = new Map<string, Promise<SpeciesPhoto | null>>();

function stripHtml(value: unknown): string {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
}

/** Lead image file of the Wikipedia article for a scientific name. */
export function parsePageImage(body: unknown): string | null {
  const pages = (body as { query?: { pages?: Record<string, { pageimage?: unknown }> } } | null)?.query?.pages;
  if (!pages) return null;
  for (const page of Object.values(pages)) if (typeof page.pageimage === 'string' && page.pageimage) return page.pageimage;
  return null;
}

/**
 * Thumbnail plus credit. Images outside `config.photos.allowedImageHosts` are rejected with the same rule the
 * service worker uses to cache photos, so every accepted photo can also be kept for offline use.
 */
export function parseImageInfo(body: unknown): SpeciesPhoto | null {
  const pages = (body as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: unknown; extmetadata?: Record<string, { value?: unknown }> }[] }> } } | null)?.query?.pages;
  const info = pages ? Object.values(pages)[0]?.imageinfo?.[0] : undefined;
  if (!info || typeof info.thumburl !== 'string') return null;
  let url: URL;
  try { url = new URL(info.thumburl); } catch { return null; }
  if (!isSpeciesPhotoUrl(url)) return null;
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

/** Looks the photo up once; a confirmed absence is remembered, a network failure is retried later. */
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

export function useSpeciesPhoto(scientificName: string | null): SpeciesPhoto | null {
  const [photo, setPhoto] = useState<SpeciesPhoto | null>(() => (scientificName ? memory.get(scientificName) ?? null : null));
  useEffect(() => {
    if (!scientificName) return;
    let active = true;
    // Offline or lookup errors leave the neutral placeholder; nothing else depends on the photo.
    fetchSpeciesPhoto(scientificName).then((found) => { if (active) setPhoto(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [scientificName]);
  return photo;
}
