import { describe, expect, it } from 'vitest';
import { HOURS_PER_DAY } from '../../config/contract';
import { applyRegionMask, birdnetWeek, countLikely, EXCLUDED_LOGIT, rankRegion, regionMask } from '../inference/geoFilter';
import { sigmoid } from '../inference/inferenceResults';
import type { LogRecord } from '../log/logRecords';
import { albumEntries, matchesSearch } from './album';
import { dominantColor, fallbackPlumage, nearestPlumage, PLUMAGES, type Plumage, type Rgb } from './plumage';
import { parseSpeciesRecord } from './speciesApi';
import { bestFacts, busiestHour, cloudFacts, phoneFacts } from './speciesRecord';
import { parseSummary } from './speciesSummary';

/** The palette of tokens.css, as the app reads it at runtime. */
const REFERENCES: Record<Plumage, Rgb> = {
  mirla: [0xF5, 0x92, 0x45], colibri: [0x6A, 0x4F, 0xD6], esmeralda: [0x0B, 0x6E, 0x4E], escarlata: [0xC4, 0x2B, 0x22],
  azulejo: [0x8D, 0xB6, 0xDF], canario: [0xFF, 0xD2, 0x4D], copeton: [0xC9, 0x9A, 0x6B], tangara: [0x4C, 0xC5, 0xC2],
  pizarra: [0x4A, 0x59, 0x63], rosado: [0xF2, 0xA7, 0xC3],
};

const record = (species: string, recordedAt: number, confidence: number, siteId: string | null = null): LogRecord => ({
  id: `${species}-${String(recordedAt)}`, species, confidence, status: 'confirmed', recordedAt, siteId, upload: 'cloud', located: true, audioId: null,
});

/** A square thumbnail filled with `color`, with `centre` painted over its middle quarter. */
function thumbnail(color: Rgb, centre: Rgb, size = 8): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = x >= size / 4 && x < size * 3 / 4 && y >= size / 4 && y < size * 3 / 4;
      pixels.set([...(inside ? centre : color), 255], (y * size + x) * 4);
    }
  }
  return pixels;
}

describe('plumage', () => {
  it('matches colored birds by hue and colorless ones to the brown or slate plate', () => {
    for (const name of PLUMAGES.filter((plate) => plate !== 'copeton' && plate !== 'pizarra')) expect(nearestPlumage(REFERENCES[name], REFERENCES)).toBe(name);
    // A photo is duller than the plate: a muted red is still the scarlet plate.
    expect(nearestPlumage([170, 60, 50], REFERENCES)).toBe('escarlata');
    expect(nearestPlumage([120, 100, 80], REFERENCES)).toBe('copeton');
    expect(nearestPlumage([60, 62, 66], REFERENCES)).toBe('pizarra');
  });
  it('finds the bird in the centre rather than the foliage around it', () => {
    const scarletOnLeaves = dominantColor(thumbnail([60, 140, 50], [215, 40, 35]), 8, 8);
    expect(nearestPlumage(scarletOnLeaves, REFERENCES)).toBe('escarlata');
    expect(dominantColor(thumbnail([128, 128, 128], [128, 128, 128]), 8, 8)).toEqual([128, 128, 128]);
  });
  it('gives a stable plate to species without a photo', () => {
    expect(fallbackPlumage('Turdus fuscater')).toBe(fallbackPlumage('Turdus fuscater'));
    expect(PLUMAGES).toContain(fallbackPlumage('Zonotrichia capensis'));
  });
});

describe('geographic filter (ADR-18)', () => {
  it('counts four BirdNET weeks per month, with days 29 to 31 in the fourth', () => {
    expect(birdnetWeek(new Date(2026, 0, 1))).toBe(1);
    expect(birdnetWeek(new Date(2026, 9, 7))).toBe(37);
    expect(birdnetWeek(new Date(2026, 9, 31))).toBe(40);
    expect(birdnetWeek(new Date(2026, 11, 31))).toBe(48);
  });
  it('drops species under the threshold and ranks the rest', () => {
    const probabilities = new Float32Array([0.5, 0.01, 0.03, 0.9]);
    const mask = regionMask(probabilities);
    expect(Array.from(mask)).toEqual([1, 0, 1, 1]);
    expect(countLikely(mask)).toBe(3);
    // Regression: the acoustic output is logits, so a ruled-out species must become a probability of 0, not 0.5.
    const logits = new Float32Array([2, 3, -1, 0.5]);
    applyRegionMask(logits, mask);
    expect(Array.from(logits)).toEqual([2, EXCLUDED_LOGIT, -1, 0.5]);
    expect(sigmoid(logits[1] ?? 0)).toBe(0);
    expect(rankRegion(probabilities, 2)).toEqual([3, 0]);
    expect(() => { applyRegionMask(new Float32Array(2), mask); }).toThrow();
  });
});

describe('album and species card', () => {
  it('merges the phone and the cloud by species, keeping the larger count and the later date', () => {
    const local = [record('A a', 1000, 0.6), record('A a', 3000, 0.9), record('B b', 2000, 0.7)];
    const cloud = [{ species: 'A a', detections: 5, bestConfidence: 0.8, firstRecordedAt: '2026-01-01T00:00:00Z', lastRecordedAt: '1970-01-01T00:00:01Z', sites: 1 }];
    const entries = albumEntries(local, cloud);
    expect(entries.map((entry) => [entry.species, entry.detections, entry.bestConfidence, entry.lastAt])).toEqual([['A a', 5, 0.9, 3000], ['B b', 1, 0.7, 2000]]);
  });
  it('searches common and scientific names without accents', () => {
    expect(matchesSearch('colibri', 'Colibri coruscans', 'Colibrí chillón')).toBe(true);
    expect(matchesSearch('CHILLON', 'Colibri coruscans', 'Colibrí chillón')).toBe(true);
    expect(matchesSearch('mirla', 'Colibri coruscans', 'Colibrí chillón')).toBe(false);
    expect(matchesSearch('  ', 'X', 'Y')).toBe(true);
  });
  it('builds the card facts from the phone and prefers the cloud when it knows more', () => {
    const site = { id: 'site-1', name: 'Humedal' };
    const at = (hour: number): number => new Date(2026, 9, 7, hour).getTime();
    const phone = phoneFacts([record('A a', at(6), 0.7, 'site-1'), record('A a', at(6), 0.9, 'unknown'), record('B b', at(18), 0.8)], 'A a', [site]);
    expect(phone).toMatchObject({ detections: 2, bestConfidence: 0.9, source: 'phone', sites: [{ id: 'site-1', name: 'Humedal', detections: 1 }] });
    expect(busiestHour(phone.hours)).toBe(6);
    const hours = Array.from({ length: HOURS_PER_DAY }, () => 0);
    const cloud = cloudFacts({ detections: 7, bestConfidence: 0.95, firstRecordedAt: null, lastRecordedAt: null, hours, sites: [], cells: [], recent: [] });
    expect(bestFacts(phone, cloud).source).toBe('cloud');
    expect(bestFacts(phone, { ...cloud, detections: 1 }).source).toBe('phone');
    expect(busiestHour(hours)).toBeNull();
  });
});

describe('external responses', () => {
  it('reads a species record and drops malformed list items', () => {
    const hours = Array.from({ length: HOURS_PER_DAY }, () => 0);
    const record = parseSpeciesRecord({
      detections: 2, best_confidence: 0.9, first_recorded_at: '2026-10-01T06:00:00Z', last_recorded_at: '2026-10-07T06:00:00Z', hours,
      sites: [{ id: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11', name: 'Humedal', detections: 2 }, { id: 'bad' }],
      cells: [{ latitude: 4.7, longitude: -74.1, detections: 2 }, { latitude: 95, longitude: 0, detections: 1 }],
      recent: [{ id: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c12', recorded_at: '2026-10-07T06:00:00Z', confidence: 0.9, status: 'confirmed', site_id: null, has_audio: false }],
    });
    expect([record.sites.length, record.cells.length, record.recent.length]).toEqual([1, 1, 1]);
    // A species never recorded answers with nulls and empty lists, not an error.
    expect(parseSpeciesRecord({ detections: 0, best_confidence: null, first_recorded_at: null, last_recorded_at: null, hours, sites: [], cells: [], recent: [] }).detections).toBe(0);
    expect(() => parseSpeciesRecord({ detections: 1, best_confidence: 2, first_recorded_at: null, last_recorded_at: null, hours })).toThrow();
  });
  it('accepts only a summary that describes one subject with an https source', () => {
    const page = { type: 'standard', extract: 'Un ave.', content_urls: { desktop: { page: 'https://es.wikipedia.org/wiki/Ave' } } };
    expect(parseSummary(page, 'es')).toEqual({ text: 'Un ave.', url: 'https://es.wikipedia.org/wiki/Ave', language: 'es' });
    expect(parseSummary({ ...page, type: 'disambiguation' }, 'es')).toBeNull();
    expect(parseSummary({ ...page, extract: ' ' }, 'es')).toBeNull();
    expect(parseSummary({ ...page, content_urls: { desktop: { page: 'javascript:alert(1)' } } }, 'es')).toBeNull();
  });
});
