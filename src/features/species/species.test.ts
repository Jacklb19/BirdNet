import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_FILES } from '../../../build.config.mjs';
import { SPECIES_NAMES_URL, commonName } from './speciesNames';
import { PHOTO_HERO_REM, THUMBNAIL_WIDTH_PX, parseCachedPhoto, parseImageInfo, parsePageImage, serializeCachedPhoto } from './speciesPhotos';

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

describe('species photos', () => {
  it('sizes thumbnails from the hero photo token', () => {
    const hero = /--photo-hero:\s*([\d.]+)rem\s*;/.exec(readFileSync('src/styles/tokens.css', 'utf8'))?.[1];
    expect(Number(hero)).toBe(PHOTO_HERO_REM);
  });

  it('reads the lead image of a Wikipedia article', () => {
    expect(parsePageImage({ query: { pages: { '1': { pageimage: 'Bird.jpg' } } } })).toBe('Bird.jpg');
    expect(parsePageImage({ query: { pages: { '-1': {} } } })).toBeNull();
  });

  it('keeps credit and rejects images outside the allowed hosts', () => {
    const info = (thumburl: string, license = 'CC BY-SA 4.0', artist = '<a href="x">Charles J. Sharp</a>') =>
      ({ query: { pages: { '9': { imageinfo: [{ thumburl, extmetadata: { LicenseShortName: { value: license }, Artist: { value: artist } } }] } } } });
    expect(parseImageInfo(info('https://upload.wikimedia.org/a.jpg'))).toEqual({ url: 'https://upload.wikimedia.org/a.jpg', author: 'Charles J. Sharp', license: 'CC BY-SA 4.0' });
    expect(parseImageInfo(info('https://upload.wikimedia.org/a.jpg', 'CC0', ''))?.author).toBeNull();
    expect(parseImageInfo(info('https://evil.example/a.jpg'))).toBeNull();
    expect(parseImageInfo(info('https://upload.wikimedia.org/a.jpg', ''))).toBeNull();
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
