import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRoute, routeHash, sectionOf, type Route } from './routes';
import { TRUNCATED_HEADER } from '../config/api';
import { HOURS_PER_DAY } from '../config/contract';
import { applyDetectionPolicy } from '../features/inference/detectionPolicy';
import { mergeSession } from '../features/listen/session';
import { chorusBars, peakHour } from '../features/sites/chorus';
import { exportCsv, parseStats } from '../features/sites/sitesApi';

const id = '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11';
const emptyDay = (): number[] => Array.from({ length: HOURS_PER_DAY }, () => 0);

describe('routes', () => {
  it('round-trips every route and falls back to listening', () => {
    const routes: Route[] = [{ name: 'listen' }, { name: 'log' }, { name: 'detection', id }, { name: 'map' }, { name: 'sites' }, { name: 'site', id }, { name: 'account' }, { name: 'settings' }, { name: 'welcome' }];
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route);
    expect(parseRoute('#/log/not-a-uuid')).toEqual({ name: 'log' });
    // 36 characters is not enough: the identifier must have the UUID layout the API issues.
    expect(parseRoute(`#/sites/${'-'.repeat(36)}`)).toEqual({ name: 'sites' });
    expect(parseRoute('')).toEqual({ name: 'listen' });
    expect(sectionOf({ name: 'site', id })).toBe('sites');
  });
});

describe('listening session', () => {
  // Windows reach the session already classified, so the statuses come from the real policy.
  const analysed = (scientificName: string, confidence: number) =>
    applyDetectionPolicy([{ classIndex: 0, label: `${scientificName}_X`, scientificName, commonName: 'X', confidence }]);

  it('keeps the best confidence and lists current singers first', () => {
    let session = mergeSession([], analysed('A a', 0.6), 1000);
    session = mergeSession(session, analysed('B b', 0.9), 2000);
    expect(session.map((s) => [s.scientificName, s.singingNow])).toEqual([['B b', true], ['A a', false]]);
    session = mergeSession(session, analysed('A a', 0.85), 3000);
    expect(session[0]).toMatchObject({ scientificName: 'A a', confidence: 0.85, status: 'confirmed_local', windows: 2, singingNow: true });
    // A weaker later window never downgrades a species the session already confirmed.
    session = mergeSession(session, analysed('A a', 0.5), 4000);
    expect(session[0]).toMatchObject({ scientificName: 'A a', confidence: 0.85, status: 'confirmed_local', windows: 3 });
  });
});

describe('chorus clock', () => {
  it('scales bars to the busiest hour and rejects malformed input', () => {
    const hourly = emptyDay().map((_, h) => (h === 6 ? 14 : h === 18 ? 7 : 0));
    const bars = chorusBars(hourly);
    expect(bars[6]).toEqual({ hour: 6, count: 14, length: 1, peak: true });
    expect(bars[18]?.length).toBe(0.5);
    expect(peakHour(hourly)).toBe(6);
    expect(peakHour(emptyDay())).toBeNull();
    expect(() => chorusBars([1, 2])).toThrow();
  });

  it('accepts only complete statistics', () => {
    expect(() => parseStats({ hourly: [1] })).toThrow();
    expect(parseStats({ hourly: emptyDay(), species: [], missing: [], species_count: 0, detections: 0, active_days: 0 }).species_count).toBe(0);
  });
});

describe('site export', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports when the API cut the CSV at its row cap', async () => {
    const csv = (truncated: string): Response => new Response('a,b\n', { headers: { [TRUNCATED_HEADER]: truncated } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(csv('true')).mockResolvedValueOnce(csv('false')));
    expect((await exportCsv('token', id)).truncated).toBe(true);
    const complete = await exportCsv('token', id);
    expect(complete.truncated).toBe(false);
    expect(await complete.blob.text()).toBe('a,b\n');
  });
});
