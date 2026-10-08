import { describe, expect, it } from 'vitest';
import { EXPORT_FALLBACK_SLUG, EXPORT_NAME_MAX_LENGTH } from './sites.config';
import {
  atLocalHour, exportFileNameFor, fileSlug, firstSeenFormat, periodStart, previewSpecies, speciesChange, visitsShare,
} from './siteText';

describe('species change', () => {
  it('compares with the previous period only when there is one', () => {
    expect(speciesChange(23, null)).toEqual({ kind: 'unknown' });
    expect(speciesChange(23, 23)).toEqual({ kind: 'same' });
    expect(speciesChange(23, 20)).toEqual({ kind: 'change', delta: 3 });
    expect(speciesChange(0, 4)).toEqual({ kind: 'change', delta: -4 });
  });
});

describe('visits', () => {
  it('says whether a species was heard on every visit, some of them or the only one', () => {
    expect(visitsShare(1, 1)).toEqual({ kind: 'only' });
    expect(visitsShare(12, 12)).toEqual({ kind: 'all' });
    expect(visitsShare(7, 12)).toEqual({ kind: 'some', days: 7, total: 12 });
  });
});

describe('species preview', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('shows the first entries and counts the rest until expanded', () => {
    expect(previewSpecies(list, false, 4)).toEqual({ visible: ['a', 'b', 'c', 'd'], hidden: 2 });
    expect(previewSpecies(list, true, 4)).toEqual({ visible: list, hidden: 0 });
    expect(previewSpecies(list.slice(0, 3), false, 4)).toEqual({ visible: ['a', 'b', 'c'], hidden: 0 });
  });
});

describe('export period', () => {
  const now = new Date(2026, 9, 7, 15, 42);

  it('counts the period back from the moment of the export, and has no start for the whole record', () => {
    expect(periodStart('week', now)).toEqual(new Date(2026, 8, 30, 15, 42));
    expect(periodStart('month', now)).toEqual(new Date(2026, 8, 7, 15, 42));
    expect(periodStart('all', now)).toBeNull();
  });
});

describe('export file name', () => {
  it('keeps a readable ASCII slug of the site name and the local dates covered', () => {
    expect(exportFileNameFor('Finca El Roble', new Date(2026, 9, 4, 23, 30), null)).toBe('birdnet-finca-el-roble-2026-10-04.csv');
    expect(exportFileNameFor('Finca El Roble', new Date(2026, 9, 4, 23, 30), new Date(2026, 8, 4, 23, 30)))
      .toBe('birdnet-finca-el-roble-2026-09-04_2026-10-04.csv');
    expect(fileSlug('  Humedal Jaboque / Engativá  ')).toBe('humedal-jaboque-engativa');
    expect(fileSlug('Barrio La Soledad #2')).toBe('barrio-la-soledad-2');
  });

  it('never yields an empty, unsafe or overlong name', () => {
    expect(fileSlug('🐦🐦')).toBe(EXPORT_FALLBACK_SLUG);
    expect(fileSlug('../../etc')).toBe('etc');
    const long = fileSlug('a '.repeat(EXPORT_NAME_MAX_LENGTH));
    expect(long.length).toBeLessThanOrEqual(EXPORT_NAME_MAX_LENGTH);
    expect(long).not.toMatch(/^-|-$/);
  });
});

describe('dates', () => {
  it('adds the year to a first sighting only when it differs from the statistics year', () => {
    const until = new Date(2026, 9, 7);
    expect(firstSeenFormat(new Date(2026, 9, 4), until)).not.toHaveProperty('year');
    expect(firstSeenFormat(new Date(2025, 11, 30), until)).toMatchObject({ year: 'numeric' });
  });

  it('places the peak at the start of the local hour', () => {
    const peak = atLocalHour(new Date(2026, 9, 7, 15, 42, 10), 6);
    expect([peak.getHours(), peak.getMinutes(), peak.getSeconds()]).toEqual([6, 0, 0]);
  });
});
