// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../config/env';
import { PHOTO_CACHE_MAX_ENTRIES } from './offline.constants';
import { cachedPhoto, isSpeciesPhotoUrl } from './photoCache';

const [photoHost = ''] = config.photos.allowedImageHosts;
const photoUrl = (index: number): string => `https://${photoHost}/thumb/${String(index)}.jpg`;
let stored: Map<string, Response>;

function withType(response: Response, type: ResponseType): Response {
  Object.defineProperty(response, 'type', { value: type });
  return response;
}
async function load(url: string): Promise<Response> {
  const tasks: Promise<unknown>[] = [];
  const response = await cachedPhoto(new Request(url), (task) => { tasks.push(task); });
  await Promise.all(tasks);
  return response;
}

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('caches', { open: vi.fn(() => Promise.resolve({
    match: (request: Request) => Promise.resolve(stored.get(request.url)?.clone()),
    put: (request: Request, response: Response) => { stored.delete(request.url); stored.set(request.url, response); return Promise.resolve(); },
    keys: () => Promise.resolve([...stored.keys()].map((url) => new Request(url))),
    delete: (request: Request) => Promise.resolve(stored.delete(request.url)),
  })) });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(withType(new Response('image'), 'cors'))));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('species photo cache', () => {
  it('matches only https photos from the configured hosts', () => {
    expect(isSpeciesPhotoUrl(new URL(photoUrl(1)))).toBe(true);
    expect(isSpeciesPhotoUrl(new URL(photoUrl(1).replace('https:', 'http:')))).toBe(false);
    expect(isSpeciesPhotoUrl(new URL('https://foreign.example/photo.jpg'))).toBe(false);
  });
  it('serves a stored photo without the network and evicts the oldest beyond the limit', async () => {
    for (let index = 0; index <= PHOTO_CACHE_MAX_ENTRIES; index++) await load(photoUrl(index));
    expect(stored.size).toBe(PHOTO_CACHE_MAX_ENTRIES);
    expect(stored.has(photoUrl(0))).toBe(false);
    vi.mocked(fetch).mockClear();
    expect(await (await load(photoUrl(PHOTO_CACHE_MAX_ENTRIES))).text()).toBe('image');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('passes opaque and failed answers through without storing them', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(withType(new Response('image'), 'opaque'));
    vi.mocked(fetch).mockResolvedValueOnce(withType(new Response(null, { status: 404 }), 'cors'));
    await load(photoUrl(1));
    await load(photoUrl(2));
    expect(stored.size).toBe(0);
  });
});
