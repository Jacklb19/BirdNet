import { describe, expect, it } from 'vitest';
import type { HistoryEntry, StoredDetection, StoredWalk } from '../offline/types';
import { WALK_STALE_MS } from './walk.config';
import { recordsCsv, walkRecords } from './walkCsv';
import { escapeXml, walkGpx } from './walkGpx';
import type { Pin } from './walkPins';
import { walkEnd, walkSongs } from './walkSummary';
import { walksToUpload, walkUpload } from './walkSync';

const START = Date.parse('2026-10-15T12:00:00.000Z');
const MINUTE = 60_000;
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000009';
const iso = (time: number): string => new Date(time).toISOString();

const walk = (changes: Partial<StoredWalk> = {}): StoredWalk => ({
  id: '00000000-0000-4000-8000-0000000000a1', startedAt: iso(START), endedAt: iso(START + 60 * MINUTE),
  track: [[4.6789, -74.1234, 0], [4.6799, -74.1234, 600]], owner: USER, ...changes,
});
const pin = (species: string, minutes: number, changes: Partial<Pin> = {}): Pin => ({
  id: `${species}-${String(minutes)}`, species, confidence: 0.8, status: 'confirmed', recordedAt: START + minutes * MINUTE, latitude: 4.6789, longitude: -74.1234, ...changes,
});

describe('walk end', () => {
  it('is the closing time of a walk that was closed', () => {
    expect(walkEnd(walk(), [], START)).toBe(START + 60 * MINUTE);
  });

  it('waits while an open walk is still being refreshed, and closes it at its last refresh once that is old', () => {
    const open = walk({ endedAt: null, lastAt: iso(START + 30 * MINUTE) });
    expect(walkEnd(open, [], START + 30 * MINUTE + WALK_STALE_MS)).toBeNull();
    expect(walkEnd(open, [], START + 31 * MINUTE + WALK_STALE_MS)).toBe(START + 30 * MINUTE);
  });

  it('closes a walk from before refreshes at the last song of the run that followed its start', () => {
    const legacy = walk({ endedAt: null, lastAt: undefined });
    const songs = [pin('a', 2), pin('a', 9), pin('b', 15), pin('c', 15 + 11)];
    expect(walkEnd(legacy, songs, START + 120 * MINUTE)).toBe(START + 15 * MINUTE);
    expect(walkEnd(legacy, [], START + 120 * MINUTE)).toBeNull();
  });
});

describe('walk songs', () => {
  it('counts species and places within the walk only, most heard first', () => {
    const songs = walkSongs([
      pin('Zonotrichia capensis', 1), pin('Turdus fuscater', 2, { confidence: 0.6 }), pin('Turdus fuscater', 3, { confidence: 0.9, latitude: 4.6799 }),
      pin('Turdus fuscater', 61), pin('Pyrocephalus rubinus', -1),
    ], START, START + 60 * MINUTE);
    expect(songs.songs).toBe(3);
    expect(songs.species).toEqual([
      { species: 'Turdus fuscater', songs: 2, bestConfidence: 0.9 }, { species: 'Zonotrichia capensis', songs: 1, bestConfidence: 0.8 },
    ]);
    expect(songs.places.map((place) => [place.species, place.latitude])).toEqual([
      ['Zonotrichia capensis', 4.6789], ['Turdus fuscater', 4.6789], ['Turdus fuscater', 4.6799],
    ]);
  });
});

describe('GPX of a walk', () => {
  const gpx = walkGpx({
    name: 'Humedal & <río>', startedAt: START, creator: 'Trino',
    track: [[4.6789, -74.1234, 0], [4.6799, -74.1234, 90]],
    waypoints: [{ latitude: 4.6799, longitude: -74.1234, time: START + MINUTE, name: 'Copetón', description: 'Zonotrichia capensis · 87 %' }],
  });
  const document = new DOMParser().parseFromString(gpx, 'application/xml');

  it('is well-formed GPX 1.1 with the path, its times and the places heard', () => {
    expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(document.documentElement.getAttribute('version')).toBe('1.1');
    const points = [...document.getElementsByTagName('trkpt')];
    expect(points.map((point) => [point.getAttribute('lat'), point.getAttribute('lon'), point.textContent])).toEqual([
      ['4.6789', '-74.1234', '2026-10-15T12:00:00.000Z'], ['4.6799', '-74.1234', '2026-10-15T12:01:30.000Z'],
    ]);
    const waypoint = document.getElementsByTagName('wpt')[0];
    expect(waypoint?.getElementsByTagName('name')[0]?.textContent).toBe('Copetón');
    expect(document.getElementsByTagName('name')[0]?.textContent).toBe('Humedal & <río>');
  });

  it('writes a path without times as points without times', () => {
    const untimed = walkGpx({ name: 'x', startedAt: START, creator: 'Trino', track: [[4.6789, -74.1234]], waypoints: [] });
    expect(untimed).toContain('<trkpt lat="4.6789" lon="-74.1234"></trkpt>');
  });

  it('escapes markup and drops characters XML cannot carry', () => {
    expect(escapeXml('a"b\'c<d>&\u0001')).toBe('a&quot;b&apos;c&lt;d&gt;&amp;');
  });
});

describe('CSV of a walk', () => {
  const detection = (id: string, minutes: number, changes: Partial<StoredDetection> = {}): StoredDetection => ({
    id, species: 'Turdus fuscater', confidence: 0.8126, status: 'confirmed', recorded_at: iso(START + minutes * MINUTE),
    location: { latitude: 4.6789, longitude: -74.1234 }, model_version: 'birdnet-v2.4:int8', owner: USER, bytes: 1, ...changes,
  });
  const synced = (id: string, minutes: number): HistoryEntry => ({
    id, species: 'Sturnella magna', confidence: 0.5, status: 'provisional', recorded_at: iso(START + minutes * MINUTE), siteId: 's1',
    syncedAt: iso(START), location: null,
  });

  it('has the columns of the account export, with reviews applied and discarded songs kept with their state', () => {
    const records = walkRecords(
      [detection('p1', 5), detection('p2', 6, { species: 'Turdus "grande", el negro' }), detection('p3', 90)],
      [synced('h1', 1)],
      new Map([['p2', { action: 'correct', species: 'Turdus serranus' }], ['h1', { action: 'discard', species: null }]]),
      [{ id: 's1', name: 'Humedal', latitude: 4.6, longitude: -74.1 }],
      START, START + 60 * MINUTE,
    );
    expect(recordsCsv(records).split('\r\n')).toEqual([
      'id,species,confidence,status,recorded_at,latitude,longitude,model_version,site,model_species,reviewed_by',
      'h1,Sturnella magna,0.500,discarded,2026-10-15T12:01:00.000Z,,,,Humedal,,person',
      'p1,Turdus fuscater,0.813,confirmed,2026-10-15T12:05:00.000Z,4.6789,-74.1234,birdnet-v2.4:int8,,,',
      'p2,Turdus serranus,0.813,corrected,2026-10-15T12:06:00.000Z,4.6789,-74.1234,birdnet-v2.4:int8,,"Turdus ""grande"", el negro",person',
      '',
    ]);
  });
});

describe('walks sent to the account', () => {
  const now = START + 3 * 60 * MINUTE;

  it('sends finished walks of this account or of none, once', () => {
    const candidates = walksToUpload([
      walk({ id: 'mine' }), walk({ id: 'no-owner', owner: null }), walk({ id: 'legacy', owner: undefined }),
      walk({ id: 'saved', account: 'saved' }), walk({ id: 'phone-only', account: 'phoneOnly' }), walk({ id: 'renamed', account: 'pending' }),
      walk({ id: 'theirs', owner: OTHER }), walk({ id: 'empty', track: [] }),
      walk({ id: 'under-way', endedAt: null, lastAt: iso(now - MINUTE) }),
    ], USER, [], now);
    expect(candidates.map((candidate) => candidate.walk.id)).toEqual(['mine', 'no-owner', 'legacy', 'renamed']);
  });

  it('sends the times of the path only when every point has one, and never ends before its last point', () => {
    expect(walkUpload(walk(), START + 5 * MINUTE)).toEqual({
      name: null, startedAt: START, endedAt: START + 10 * MINUTE, track: [[4.6789, -74.1234, 0], [4.6799, -74.1234, 600]],
    });
    const legacy = walkUpload(walk({ name: 'Al alba', track: [[4.6789, -74.1234], [4.6799, -74.1234]] }), START + 5 * MINUTE);
    expect(legacy).toMatchObject({ name: 'Al alba', endedAt: START + 5 * MINUTE, track: [[4.6789, -74.1234], [4.6799, -74.1234]] });
  });
});
