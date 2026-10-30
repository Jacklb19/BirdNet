import { describe, expect, it } from 'vitest';
import type { StoredWalk } from '../offline/types';
import type { AccountWalkPath } from '../walk/walksApi';
import type { Pin } from '../walk/walkPins';
import type { MapDetection } from './mapData';
import { ownMap } from './ownMap';

const LOCAL_WALK = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_WALK = '00000000-0000-4000-8000-000000000002';
const pin: Pin = { id: 'p1', species: 'Turdus fuscater', confidence: 0.9, status: 'confirmed', recordedAt: Date.UTC(2026, 9, 20), latitude: 4.679, longitude: -74.123 };
const stored = { id: LOCAL_WALK, startedAt: '2026-10-20T12:00:00Z', endedAt: '2026-10-20T13:00:00Z', track: [[4.679, -74.123]] } as unknown as StoredWalk;
const place = (species: string, latitude: number, bestConfidence: number): AccountWalkPath['places'][number] =>
  ({ species, latitude, longitude: -74.123, songs: 2, bestConfidence, firstAt: Date.UTC(2026, 9, 1) });

describe('own map', () => {
  it('adds the walks that are only in the account, once', () => {
    const account: AccountWalkPath[] = [
      { id: LOCAL_WALK, startedAt: 0, track: [[1, 1]], places: [place('Zonotrichia capensis', 1, 0.9)] },
      { id: ACCOUNT_WALK, startedAt: 0, track: [[4.7, -74.1], [4.7001, -74.1]], places: [place('Turdus fuscater', 4.679, 0.9), place('Sturnella magna', 4.7, 0.6)] },
    ];
    const view = ownMap([pin], [stored], { species: null, walking: false }, account);
    // The walk on the phone is drawn from the phone; the place the phone already has is not drawn twice.
    expect(view.tracks).toHaveLength(2);
    expect(view.result.detections.map((row) => [row.species, row.status])).toEqual([['Turdus fuscater', 'confirmed'], ['Sturnella magna', 'provisional']]);
    expect(view.speciesOptions).toEqual(['Sturnella magna', 'Turdus fuscater']);
    expect(ownMap([pin], [stored], { species: 'Sturnella magna', walking: false }, account).result.detections).toHaveLength(1);
  });

  it('adds the songs of the account the phone does not keep, never twice', () => {
    const song = (id: string, species: string): MapDetection => ({ id, species, confidence: 0.85, status: 'confirmed', recorded_at: '2026-09-01T10:00:00.000Z',
      latitude: 4.7, longitude: -74.05, own: true, site_name: null, generalized_m: null });
    const view = ownMap([pin], [], { species: null, walking: false }, [], [song('p1', 'Turdus fuscater'), song('old', 'Pheucticus ludovicianus')]);
    expect(view.result.detections.map((row) => row.id)).toEqual(['p1', 'old']);
    expect(view.speciesOptions).toEqual(['Pheucticus ludovicianus', 'Turdus fuscater']);
  });
});
