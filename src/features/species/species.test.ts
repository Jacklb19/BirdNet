import { readFileSync } from 'node:fs';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_FILES } from '../../../build.config.mjs';
import { STORAGE_KEYS } from '../../config/storage';
import { SPECIES_NAMES_URL, commonName } from './speciesNames';
import {
  PhotoLookupError, SPECIES_PHOTOS_URL, THUMBNAIL_WIDTH_PX, fetchSpeciesPhoto, parseCachedPhoto, parseImageInfo, parsePageImage, parsePhotoIndex,
  serializeCachedPhoto, useSpeciesPhoto,
} from './speciesPhotos';

describe('species names', () => {
  const names = { 'Turdus fuscater': ['Mirlo Grande', 'Great Thrush'], Engine: ['', 'Engine'] } as Record<string, [string, string]>;

  it('loads the file the build script writes and the service worker precaches', () => {
    expect(SPECIES_NAMES_URL.endsWith(`/${MODEL_FILES.speciesNames}`)).toBe(true);
  });

  it('uses the active language and never invents a translation', () => {
    expect(commonName(names, 'Turdus fuscater', 'es')).toBe('Mirlo Grande');
    expect(commonName(names, 'Turdus fuscater', 'en')).toBe('Great Thrush');
    expect(commonName(names, 'Engine', 'es')).toBe('Engine');
    expect(commonName(names, 'Unknown species', 'es', 'Fallback')).toBe('Fallback');
    expect(commonName(null, 'Unknown species', 'es')).toBe('Unknown species');
  });
});

const info = (thumburl: string, license = 'CC BY-SA 4.0', artist = '<a href="x">Charles J. Sharp</a>') =>
  ({ query: { pages: { '9': { imageinfo: [{ thumburl, extmetadata: { LicenseShortName: { value: license }, Artist: { value: artist } } }] } } } });

describe('species photos', () => {
  it('requests thumbnails that cover the largest sticker at twice the density', () => {
    const sticker = /--sticker-xl:\s*([\d.]+)rem\s*;/.exec(readFileSync('src/styles/tokens.css', 'utf8'))?.[1];
    const ROOT_FONT_PX = 16;
    expect(Number(sticker) * ROOT_FONT_PX * 2).toBeLessThanOrEqual(THUMBNAIL_WIDTH_PX);
  });

  it('reads the bundled regional index and ignores what it cannot trust', () => {
    expect(SPECIES_PHOTOS_URL.endsWith(`/${MODEL_FILES.speciesPhotos}`)).toBe(true);
    const good = ['https://thumb.wikimedia.org/a/500px-a.jpg', 'Ana', 'CC BY 4.0'];
    const index = parsePhotoIndex({ width: THUMBNAIL_WIDTH_PX, photos: {
      'Turdus fuscater': good, 'No author': ['https://upload.wikimedia.org/b.jpg', null, 'CC0'],
      'Foreign host': ['https://tracker.example/c.jpg', 'X', 'CC0'], 'No license': ['https://thumb.wikimedia.org/d.jpg', 'X', ''], Broken: 'x',
    } });
    expect([...index.keys()]).toEqual(['Turdus fuscater', 'No author']);
    expect(index.get('Turdus fuscater')).toEqual({ url: good[0], author: 'Ana', license: 'CC BY 4.0' });
    // An index built for another thumbnail size is not used: its pictures would be the wrong files.
    expect(parsePhotoIndex({ width: THUMBNAIL_WIDTH_PX + 1, photos: { 'Turdus fuscater': good } }).size).toBe(0);
    expect(parsePhotoIndex(null).size).toBe(0);
  });

  it('ships an index whose every photo passes those rules', () => {
    const file = JSON.parse(readFileSync(`public/models/${MODEL_FILES.speciesPhotos}`, 'utf8')) as { photos: Record<string, unknown> };
    expect(parsePhotoIndex(file).size).toBe(Object.keys(file.photos).length);
  });

  it('reads the lead image of a Wikipedia article', () => {
    expect(parsePageImage({ query: { pages: { '1': { pageimage: 'Bird.jpg' } } } })).toBe('Bird.jpg');
    expect(parsePageImage({ query: { pages: { '-1': { missing: '' } } } })).toBeNull();
    // MediaWiki answers errors (rate limit, replication lag) with HTTP 200 and no pages: not an absence.
    expect(() => parsePageImage({ error: { code: 'maxlag' } })).toThrow(PhotoLookupError);
  });

  it('keeps credit, reports confirmed absences and rejects images outside the allowed hosts', () => {
    // Commons answers thumbnails on thumb.wikimedia.org (checked against the live API in October 2026).
    const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Bird.jpg/960px-Bird.jpg';
    expect(parseImageInfo(info(thumb))).toEqual({ url: thumb, author: 'Charles J. Sharp', license: 'CC BY-SA 4.0' });
    expect(parseImageInfo(info('https://upload.wikimedia.org/a.jpg', 'CC0', ''))?.author).toBeNull();
    expect(parseImageInfo(info('https://upload.wikimedia.org/a.jpg', ''))).toBeNull();
    expect(parseImageInfo({ query: { pages: { '-1': { missing: '' } } } })).toBeNull();
    // Neither says whether the species has a photo, so they must not become a cached absence.
    expect(() => parseImageInfo(info('https://evil.example/a.jpg'))).toThrow(PhotoLookupError);
    expect(() => parseImageInfo({ query: { pages: { '9': {} } } })).toThrow(PhotoLookupError);
  });

  describe('lookup cache', () => {
    afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

    const answer = (body: unknown): Response => new Response(JSON.stringify(body));
    /** Requests to Wikipedia and Commons; the bundled index is fetched once per page and is not a lookup. */
    const lookups = (fetch: ReturnType<typeof vi.fn>): number =>
      fetch.mock.calls.filter(([url]) => typeof url === 'string' && !url.includes(MODEL_FILES.speciesPhotos)).length;
    const stubLookups = (thumburl: string) => {
      const fetch = vi.fn((url: string) => Promise.resolve(answer(
        url.includes('pageimages') ? { query: { pages: { '1': { pageimage: 'Bird.jpg' } } } } : info(thumburl),
      )));
      vi.stubGlobal('fetch', fetch);
      return fetch;
    };

    it('does not remember a rejected image host as a species without photo', async () => {
      const fetch = stubLookups('https://evil.example/a.jpg');
      await expect(fetchSpeciesPhoto('Rejecta hostis')).rejects.toThrow(PhotoLookupError);
      expect(localStorage.getItem(`${STORAGE_KEYS.photoPrefix}Rejecta hostis`)).toBeNull();
      await expect(fetchSpeciesPhoto('Rejecta hostis')).rejects.toThrow(PhotoLookupError);
      // Looked up again (page image and image information) instead of answering from a cached absence.
      expect(lookups(fetch)).toBe(4);
    });

    it('does not remember a network failure, and remembers a confirmed answer', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
      await expect(fetchSpeciesPhoto('Turdus fuscater')).rejects.toThrow();
      expect(localStorage.getItem(`${STORAGE_KEYS.photoPrefix}Turdus fuscater`)).toBeNull();
      const fetch = stubLookups('https://thumb.wikimedia.org/a.jpg');
      expect((await fetchSpeciesPhoto('Turdus fuscater'))?.url).toBe('https://thumb.wikimedia.org/a.jpg');
      expect(await fetchSpeciesPhoto('Turdus fuscater')).not.toBeNull();
      expect(lookups(fetch)).toBe(2);
    });

    it('never keeps the previous species photo while the next one is looked up', async () => {
      const thumb = 'https://thumb.wikimedia.org/prior.jpg';
      // The next species' lookup never answers, like a slow connection.
      vi.stubGlobal('fetch', vi.fn((url: string) => (url.includes('Next') ? new Promise<Response>(() => undefined) : Promise.resolve(answer(
        url.includes('pageimages') ? { query: { pages: { '1': { pageimage: 'Prior.jpg' } } } } : info(thumb),
      )))));
      const { result, rerender } = renderHook(({ name }: { name: string }) => useSpeciesPhoto(name), { initialProps: { name: 'Prior avis' } });
      await waitFor(() => { expect(result.current?.url).toBe(thumb); });
      rerender({ name: 'Next avis' });
      expect(result.current).toBeNull();
    });
  });

  it('ignores cache entries written for another version or thumbnail size', () => {
    const photo = { url: 'https://upload.wikimedia.org/a.jpg', author: null, license: 'CC0' };
    expect(parseCachedPhoto(serializeCachedPhoto(photo))).toEqual(photo);
    expect(parseCachedPhoto(serializeCachedPhoto(null))).toBeNull();
    const entry = JSON.parse(serializeCachedPhoto(photo)) as { version: number; width: number };
    expect(parseCachedPhoto(JSON.stringify({ ...entry, version: entry.version + 1 }))).toBeUndefined();
    expect(parseCachedPhoto(JSON.stringify({ ...entry, width: THUMBNAIL_WIDTH_PX + 1 }))).toBeUndefined();
    // Entries from before versioning: the bare absence marker and an unwrapped photo.
    expect(parseCachedPhoto('none')).toBeUndefined();
    expect(parseCachedPhoto(JSON.stringify({ ...photo, author: 'Wikimedia Commons' }))).toBeUndefined();
  });
});
