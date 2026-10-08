import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOURS_PER_DAY } from '../../config/contract';
import { exportCsv, parseStats } from './sitesApi';

const id = '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11';

const valid = {
  period: 'month', since: '2026-09-07T12:00:00Z', until: '2026-10-07T12:00:00Z', species_count: 1, previous_species_count: 0,
  detections: 3, active_days: 2, hourly: Array.from({ length: HOURS_PER_DAY }, (_, hour) => (hour === 6 ? 3 : 0)),
  species: [{ species: 'Zonotrichia capensis', detections: 3, days: 2, first_seen: '2026-10-04T06:10:00Z', is_new: true }],
  missing: ['Turdus fuscater'],
};

describe('site statistics contract', () => {
  it('accepts a complete answer', () => {
    expect(parseStats(valid)).toEqual(valid);
  });

  it('rejects values the chart or the species rows cannot show', () => {
    const hourly: number[] = [...valid.hourly];
    hourly[3] = -1;
    expect(() => parseStats({ ...valid, hourly })).toThrow();
    expect(() => parseStats({ ...valid, species: [{ ...valid.species[0], first_seen: 'yesterday' }] })).toThrow();
    expect(() => parseStats({ ...valid, species: [{ ...valid.species[0], detections: '3' }] })).toThrow();
    expect(() => parseStats({ ...valid, missing: [null] })).toThrow();
  });

  it('checks the period window and the comparison count', () => {
    // The whole record has no start and nothing to compare with.
    expect(parseStats({ ...valid, period: 'all', since: null, previous_species_count: null }).since).toBeNull();
    expect(() => parseStats({ ...valid, period: 'decade' })).toThrow();
    expect(() => parseStats({ ...valid, since: 'Oct 7, 2026' })).toThrow();
    expect(() => parseStats({ ...valid, since: undefined })).toThrow();
    expect(() => parseStats({ ...valid, until: null })).toThrow();
    expect(() => parseStats({ ...valid, previous_species_count: '0' })).toThrow();
    expect(() => parseStats({ ...valid, previous_species_count: undefined })).toThrow();
  });
});

describe('site export request', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks for the chosen period only, and for the whole record without a start', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('a,b\n')));
    vi.stubGlobal('fetch', fetch);
    await exportCsv('token', id, new Date('2026-09-07T12:00:00Z'));
    await exportCsv('token', id);
    const queries = fetch.mock.calls.map((call: unknown[]) => new URL(String(call[0]), 'http://localhost').searchParams);
    expect(queries[0]?.get('site_id')).toBe(id);
    expect(queries[0]?.get('since')).toBe('2026-09-07T12:00:00.000Z');
    expect(queries[1]?.has('since')).toBe(false);
  });
});
