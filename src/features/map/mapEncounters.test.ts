import { describe, expect, it } from 'vitest';
import { MAP_ENCOUNTERS } from './map.config';
import { toFeatureCollection, type MapDetection } from './mapData';
import { groupEncounters } from './mapEncounters';
import { EARTH_RADIUS_M } from '../walk/walkGeometry';

const start = Date.UTC(2026, 10, 16, 12);
const row = (id: string, seconds = 0, northMeters = 0, changes: Partial<MapDetection> = {}): MapDetection => ({
  id, species: 'Turdus fuscater', recorded_at: new Date(start + seconds * 1000).toISOString(),
  latitude: northMeters / EARTH_RADIUS_M * 180 / Math.PI, longitude: 0, confidence: 0.95, status: 'confirmed',
  own: true, site_name: null, generalized_m: null, ...changes,
});

describe('acoustic encounter display grouping', () => {
  it('draws five nearby calls as one encounter while retaining all five detections', () => {
    const records = Array.from({ length: 5 }, (_, index) => row(String(index), index * 30, index * 10));
    const [encounter] = groupEncounters(records);
    expect(encounter).toMatchObject({ kind: 'encounter', detectionCount: 5, latitude: 0, longitude: 0,
      recorded_at: records[0]?.recorded_at, lastRecordedAt: records[4]?.recorded_at });
    expect(encounter?.members).toEqual(records);
    expect(toFeatureCollection(groupEncounters(records)).features).toHaveLength(1);
  });

  it('starts another encounter beyond the display radius without claiming another individual', () => {
    expect(groupEncounters([row('a'), row('b', 10, MAP_ENCOUNTERS.radiusMeters + 1)])).toHaveLength(2);
  });

  it('measures every position against a fixed anchor rather than chaining a whole walk', () => {
    const encounters = groupEncounters([row('a'), row('b', 10, 40), row('c', 20, 80), row('d', 30, 120)]);
    expect(encounters.map((group) => group.members.map((member) => member.id))).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps an ongoing encounter alive from its last detection, and splits after a silence', () => {
    const seconds = MAP_ENCOUNTERS.maxGapMs / 1000;
    expect(groupEncounters([row('a'), row('b', seconds), row('c', seconds * 2)])).toHaveLength(1);
    expect(groupEncounters([row('a'), row('b', seconds + 0.001)])).toHaveLength(2);
    expect(groupEncounters([row('a'), row('b', 86_400)])).toHaveLength(2);
  });

  it('never joins species or the viewer’s private records to other people’s records', () => {
    const records = [row('a'), row('b', 1, 0, { species: 'Colibri coruscans' }), row('c', 2, 0, { own: false })];
    expect(groupEncounters(records)).toHaveLength(3);
  });

  it('does not upgrade mixed human reviews using the highest confidence', () => {
    const records = [row('a', 0, 0, { status: 'verified' }), row('b', 1, 0, { status: 'provisional', confidence: 0.6 }),
      row('c', 2, 0, { status: 'corrected', confidence: 0.7 })];
    const [encounter] = groupEncounters(records);
    expect(encounter?.status).toBe('provisional');
    expect(encounter?.members).toEqual(records);
  });

  it('is deterministic across load order and does not mutate the source records', () => {
    const records = [row('z'), row('a'), row('c', 1, 40), row('d', 2, 80)];
    const snapshot = structuredClone(records);
    expect(groupEncounters(records)).toEqual(groupEncounters([...records].reverse()));
    expect(records).toEqual(snapshot);
    expect(groupEncounters([row('same', 0, 0, { status: 'corrected' }), row('same')])[0]?.members[0]?.status).toBe('corrected');
  });

  it('chooses the nearest eligible anchor and starts a new one when an old anchor expires', () => {
    const records = [row('a'), row('b', 1, 100), row('c', 2, 55), row('d', 400, 0)];
    expect(groupEncounters(records).map((group) => group.members.map((member) => member.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('finds neighbours across bucket boundaries, the date line and near the poles', () => {
    expect(groupEncounters([row('a', 0, 0, { longitude: 179.9999 }), row('b', 1, 0, { longitude: -179.9999 })])).toHaveLength(1);
    expect(groupEncounters([row('a', 0, 0, { latitude: 89.9999, longitude: 0 }), row('b', 1, 0, { latitude: 89.9999, longitude: 180 })])).toHaveLength(1);
    expect(groupEncounters([row('a', 0, 59), row('b', 1, 61)])).toHaveLength(1);
  });

  it('keeps a protected cell as a summary without estimating spatial encounters or revealing another cell', () => {
    const records = [row('a', 0, 0, { own: false, generalized_m: 11_000 }), row('b', 1000, 0, { own: false, generalized_m: 11_000 }),
      row('c', 0, 11_000, { own: false, generalized_m: 11_000 }), row('own')];
    const encounters = groupEncounters(records);
    expect(encounters).toHaveLength(3);
    expect(encounters[0]).toMatchObject({ kind: 'summary', latitude: 0, longitude: 0, generalized_m: 11_000, detectionCount: 2 });
    expect(encounters.filter((group) => group.kind === 'encounter')).toHaveLength(1);
  });

  it('keeps known counts of archived summaries and never merges them into timed encounters', () => {
    const encounters = groupEncounters([row('summary', 0, 0, { summary_count: 7 }), row('raw', 1)]);
    expect(encounters).toHaveLength(2);
    expect(encounters[0]).toMatchObject({ kind: 'summary', detectionCount: 7 });
    expect(encounters[1]).toMatchObject({ kind: 'encounter', detectionCount: 1 });
  });

  it('does not create encounters without evidence', () => { expect(groupEncounters([])).toEqual([]); });
});
