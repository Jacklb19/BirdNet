import { config } from '../../config/env';
import {
  PHOTO_CACHE_MAX_ENTRIES, PHOTO_CACHE_NAME, SECURE_PROTOCOL, SUMMARY_CACHE_MAX_ENTRIES, SUMMARY_CACHE_NAME,
  TAXON_CACHE_MAX_ENTRIES, TAXON_CACHE_NAME,
} from './offline.constants';

/** Only readable cross-origin answers are kept: opaque ones hide failures and cost padded storage quota. */
const CACHEABLE_RESPONSE_TYPE: ResponseType = 'cors';

/** Species photos come only from the configured image hosts, over https. */
export function isSpeciesPhotoUrl(url: URL): boolean {
  return url.protocol === SECURE_PROTOCOL && config.photos.allowedImageHosts.includes(url.hostname);
}

/** Species summaries from the configured Wikipedia REST endpoints (species/speciesSummary.ts), kept for offline reading. */
export function isSpeciesSummaryUrl(url: URL): boolean {
  return url.protocol === SECURE_PROTOCOL && Object.values(config.summaries).some((base) => url.href.startsWith(`${base}/`));
}

/**
 * Taxonomy and conservation status from the configured GBIF API (species/gbif.ts), kept for offline reading. The
 * range map is left out: its tiles and extent change with every zoom and species, and a map needs the network anyway.
 */
export function isTaxonUrl(url: URL): boolean {
  return url.protocol === SECURE_PROTOCOL && url.href.startsWith(`${config.gbif.apiUrl}/`) && !url.href.startsWith(`${config.gbif.tilesUrl}/`);
}

/** Drops the oldest entries beyond `maxEntries`; Cache API keys are returned in insertion order. */
export async function trimCache(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(key);
}

async function store(cacheName: string, maxEntries: number, request: Request, response: Response): Promise<void> {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await trimCache(cache, maxEntries);
}

/**
 * Cache-first: what was seen once stays available offline. Storing runs through `keepAlive`
 * (`ExtendableEvent.waitUntil`) so the response reaches the page without waiting for the cache write.
 */
async function cacheFirst(cacheName: string, maxEntries: number, request: Request, keepAlive: (task: Promise<unknown>) => void): Promise<Response> {
  const cached = await (await caches.open(cacheName)).match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === CACHEABLE_RESPONSE_TYPE) keepAlive(store(cacheName, maxEntries, request, response.clone()));
  return response;
}

export function cachedPhoto(request: Request, keepAlive: (task: Promise<unknown>) => void): Promise<Response> {
  return cacheFirst(PHOTO_CACHE_NAME, PHOTO_CACHE_MAX_ENTRIES, request, keepAlive);
}

export function cachedSummary(request: Request, keepAlive: (task: Promise<unknown>) => void): Promise<Response> {
  return cacheFirst(SUMMARY_CACHE_NAME, SUMMARY_CACHE_MAX_ENTRIES, request, keepAlive);
}

export function cachedTaxon(request: Request, keepAlive: (task: Promise<unknown>) => void): Promise<Response> {
  return cacheFirst(TAXON_CACHE_NAME, TAXON_CACHE_MAX_ENTRIES, request, keepAlive);
}
