import { describe, expect, it } from 'vitest';
import type { HistoryEntry, StoredDetection, TrackPoint } from '../offline/types';
import { appendTrackPoint, distanceMeters, hexKey, hexOf, hexRing, territories, trackMeters } from './walkGeometry';
import { pinsOfWalk, toPins, walkTotals } from './walkPins';

const SIZE = 60;
const BOGOTA = { latitude: 4.6584, longitude: -74.0935 };

describe('walk path', () => {
  it('measures a hundredth of a degree of latitude as about 1.1 km', () => {
    expect(distanceMeters([4.65, -74.09], [4.66, -74.09])).toBeCloseTo(1111.95, 0);
  });

  it('adds a cell only when the person has moved to another one', () => {
    const start = appendTrackPoint([], BOGOTA, 10);
    expect(start).toEqual([[4.6584, -74.0935]]);
    expect(appendTrackPoint(start, BOGOTA, 10)).toBe(start);
    expect(appendTrackPoint(start, { latitude: 4.6585, longitude: -74.0935 }, 10)).toHaveLength(2);
  });

  it('stops growing at its limit instead of dropping the start of the walk', () => {
    const full: TrackPoint[] = [[4.1, -74], [4.2, -74]];
    expect(appendTrackPoint(full, BOGOTA, 2)).toBe(full);
  });

  it('adds up the legs of a path', () => {
    const track: TrackPoint[] = [[4.65, -74.09], [4.66, -74.09], [4.65, -74.09]];
    expect(trackMeters(track)).toBeCloseTo(2 * distanceMeters([4.65, -74.09], [4.66, -74.09]), 6);
    expect(trackMeters([[4.65, -74.09]])).toBe(0);
  });
});

describe('territories', () => {
  it('files a location in the hexagon whose outline contains it', () => {
    const cell = hexOf(BOGOTA, SIZE);
    const ring = hexRing(cell, SIZE);
    expect(ring).toHaveLength(7);
    expect(ring[0]).toEqual(ring[6]);
    const longitudes = ring.map((point) => point[0]);
    const latitudes = ring.map((point) => point[1]);
    expect(BOGOTA.longitude).toBeGreaterThan(Math.min(...longitudes));
    expect(BOGOTA.longitude).toBeLessThan(Math.max(...longitudes));
    expect(BOGOTA.latitude).toBeGreaterThan(Math.min(...latitudes));
    expect(BOGOTA.latitude).toBeLessThan(Math.max(...latitudes));
  });

  it('maps every corner region of a hexagon back to a neighbouring or the same cell, never further', () => {
    const cell = hexOf(BOGOTA, SIZE);
    for (const [longitude, latitude] of hexRing(cell, SIZE)) {
      const other = hexOf({ latitude, longitude }, SIZE);
      expect(Math.abs(other.q - cell.q)).toBeLessThanOrEqual(1);
      expect(Math.abs(other.r - cell.r)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps places a kilometre apart in different hexagons', () => {
    expect(hexKey(hexOf(BOGOTA, SIZE))).not.toBe(hexKey(hexOf({ latitude: 4.6684, longitude: -74.0935 }, SIZE)));
  });

  it('gives each hexagon to the bird heard most in it, alphabetically on a tie', () => {
    const far = { latitude: 4.7, longitude: -74.05 };
    const result = territories([
      { species: 'Zonotrichia capensis', ...BOGOTA },
      { species: 'Turdus fuscater', ...BOGOTA },
      { species: 'Turdus fuscater', ...BOGOTA },
      { species: 'Zonotrichia capensis', ...far },
      { species: 'Colibri coruscans', ...far },
    ], SIZE);
    expect(result).toHaveLength(2);
    expect(result.find((territory) => hexKey(territory.cell) === hexKey(hexOf(BOGOTA, SIZE))))
      .toMatchObject({ species: 'Turdus fuscater', songs: 3, speciesCount: 2 });
    expect(result.find((territory) => hexKey(territory.cell) === hexKey(hexOf(far, SIZE))))
      .toMatchObject({ species: 'Colibri coruscans', songs: 2, speciesCount: 2 });
  });
});

describe('own pins', () => {
  const pending = (id: string, recordedAt: string, location: StoredDetection['location']): StoredDetection => ({
    id, species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recorded_at: recordedAt, location,
    model_version: 'v', owner: null, audioId: null, metadataSynced: false, bytes: 0,
  });
  const synced = (id: string, recordedAt: string, location?: HistoryEntry['location']): HistoryEntry => ({
    id, species: 'Colibri coruscans', confidence: 0.8, status: 'provisional', recorded_at: recordedAt, siteId: null,
    syncedAt: recordedAt, ...(location === undefined ? {} : { location }),
  });

  it('keeps only songs with a place, once each, oldest first', () => {
    const pins = toPins(
      [pending('b', '2026-10-10T10:05:00Z', BOGOTA), pending('c', '2026-10-10T10:06:00Z', null)],
      [synced('a', '2026-10-10T10:00:00Z', BOGOTA), synced('b', '2026-10-10T10:05:00Z', BOGOTA), synced('old', '2026-09-01T10:00:00Z')],
    );
    expect(pins.map((pin) => pin.id)).toEqual(['a', 'b']);
    expect(pins[1]).toMatchObject({ species: 'Turdus fuscater', latitude: BOGOTA.latitude, longitude: BOGOTA.longitude });
  });

  it('assigns to a walk the songs recorded while it lasted', () => {
    const pins = toPins([], [
      synced('before', '2026-10-10T09:59:00Z', BOGOTA), synced('during', '2026-10-10T10:10:00Z', BOGOTA), synced('after', '2026-10-10T11:01:00Z', BOGOTA),
    ]);
    const walk = { startedAt: '2026-10-10T10:00:00Z', endedAt: '2026-10-10T11:00:00Z' };
    expect(pinsOfWalk(pins, walk, Date.parse('2026-10-10T12:00:00Z')).map((pin) => pin.id)).toEqual(['during']);
    expect(pinsOfWalk(pins, { ...walk, endedAt: null }, Date.parse('2026-10-10T12:00:00Z')).map((pin) => pin.id)).toEqual(['during', 'after']);
  });

  it('totals the walks and what was heard', () => {
    const pins = toPins([pending('b', '2026-10-10T10:05:00Z', BOGOTA)], [synced('a', '2026-10-10T10:00:00Z', BOGOTA)]);
    const totals = walkTotals([{ track: [[4.65, -74.09], [4.66, -74.09]] }, { track: [] }], pins);
    expect(totals).toMatchObject({ walks: 2, songs: 2, species: 2 });
    expect(totals.meters).toBeCloseTo(1111.95, 0);
  });
});
