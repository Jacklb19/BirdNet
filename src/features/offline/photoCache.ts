import { config } from '../../config/env';
import { PHOTO_CACHE_MAX_ENTRIES, PHOTO_CACHE_NAME, SECURE_PROTOCOL } from './offline.constants';

/** Only readable cross-origin answers are kept: opaque ones hide failures and cost padded storage quota. */
const CACHEABLE_RESPONSE_TYPE: ResponseType = 'cors';

/** Species photos come only from the configured image hosts, over https. */
export function isSpeciesPhotoUrl(url: URL): boolean {
  return url.protocol === SECURE_PROTOCOL && config.photos.allowedImageHosts.includes(url.hostname);
}

/** Drops the oldest entries beyond `maxEntries`; Cache API keys are returned in insertion order. */
export async function trimCache(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(key);
}

async function storePhoto(request: Request, response: Response): Promise<void> {
  const cache = await caches.open(PHOTO_CACHE_NAME);
  await cache.put(request, response);
  await trimCache(cache, PHOTO_CACHE_MAX_ENTRIES);
}

/**
 * Cache-first: a photo seen once stays available offline. Storing runs through `keepAlive`
 * (`ExtendableEvent.waitUntil`) so the image reaches the page without waiting for the cache write.
 */
export async function cachedPhoto(request: Request, keepAlive: (task: Promise<unknown>) => void): Promise<Response> {
  const cached = await (await caches.open(PHOTO_CACHE_NAME)).match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === CACHEABLE_RESPONSE_TYPE) keepAlive(storePhoto(request, response.clone()));
  return response;
}
