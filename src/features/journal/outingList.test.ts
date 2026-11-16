import { describe, expect, it } from 'vitest';
import type { WalkView } from '../walk/useWalks';
import { outingList } from './outingList';
import type { EntityRecord, OutingData } from './types';

const outing = (id: string, data: Partial<OutingData>, localWalkId?: string): EntityRecord<'outing'> => ({
  tag: 'entity', key: `o:${id}`, id, owner: 'owner', kind: 'outing', version: 1, revision: 1, dirty: false, pending: null,
  deleted: false, conflict: false, createdAt: '', updatedAt: '', ...(localWalkId ? { localWalkId } : {}),
  data: { title: null, kind: 'stationary', started_at: '2026-11-10T10:00:00Z', ended_at: null, note: null, site_id: null, walk_id: null, ...data },
});

const walk = (id: string, startedAt: string): WalkView => ({
  id, name: null, startedAt: Date.parse(startedAt), endedAt: null, live: false, meters: 0, songs: 0, species: [], where: 'phone', track: null,
});

describe('outings of the log', () => {
  const walkOuting = outing('a', { kind: 'walk', started_at: '2026-11-12T08:00:00Z', walk_id: 'w1' });
  const pendingWalkOuting = outing('b', { kind: 'walk', started_at: '2026-11-11T08:00:00Z' }, 'w2');
  const atOneSpot = outing('c', { kind: 'stationary', started_at: '2026-11-13T08:00:00Z' });
  const imported = outing('d', { kind: 'import', started_at: '2025-03-04T10:06:00Z' });
  const walks = [walk('w1', '2026-11-12T08:00:00Z'), walk('w2', '2026-11-11T08:00:00Z'), walk('w3', '2026-11-12T08:00:00Z'), walk('w0', '2026-10-01T07:00:00Z')];

  it('lists a walk once: through the outing that names it, or alone when none does', () => {
    const items = outingList([walkOuting, pendingWalkOuting, atOneSpot, imported], walks, 'all');
    expect(items.map((item) => (item.kind === 'outing' ? item.row.id : item.walk.id))).toEqual(['c', 'a', 'w3', 'b', 'w0', 'd']);
  });

  it('never joins a walk to an outing by coincident times', () => {
    // w3 starts exactly when outing "a" does, but "a" names w1: w3 stays a walk of its own.
    expect(outingList([walkOuting], walks, 'walk').some((item) => item.kind === 'walk' && item.walk.id === 'w3')).toBe(true);
  });

  it('filters by the way of going out; old walks count as walks', () => {
    expect(outingList([walkOuting, atOneSpot, imported], walks, 'stationary').map((item) => item.kind === 'outing' && item.row.id)).toEqual(['c']);
    expect(outingList([walkOuting, atOneSpot, imported], walks, 'import')).toHaveLength(1);
    expect(outingList([walkOuting, atOneSpot], walks, 'walk').every((item) => item.kind === 'walk' || item.row.data.kind === 'walk')).toBe(true);
  });
});
