import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ROUTES } from '../../config/api';
import {
  clampBounds, fetchMapDetections, mapFailure, periodStart, speciesOptions, toFeatureCollection, type MapDetection, type MapFailure,
} from './mapData';

const row: MapDetection = { id: 'a', species: 'Turdus fuscater', confidence: 0.91, status: 'confirmed', recorded_at: '2026-10-06T12:00:00Z', latitude: 4.679, longitude: -74.123 };

describe('mapData', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('computes period starts and clamps world-wrapped views', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    expect(periodStart('week', now)?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(periodStart('all', now)).toBeNull();
    expect(clampBounds({ west: -400, south: -95, east: 400, north: 95 })).toEqual({ west: -180, south: -90, east: 180, north: 90 });
  });

  it('builds GeoJSON in longitude-latitude order and sorted species options', () => {
    const collection = toFeatureCollection([row]);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-74.123, 4.679]);
    expect(speciesOptions([{ ...row, species: 'Zonotrichia capensis' }, row, row])).toEqual(['Turdus fuscater', 'Zonotrichia capensis']);
  });

  it('sends filters with the session and drops malformed rows', async () => {
    const malformed = [
      { id: 'bad' }, { ...row, id: 'b', status: 'unknown' }, { ...row, id: 'c', recorded_at: 'yesterday' },
      { ...row, id: 'd', confidence: 1.4 }, { ...row, id: 'e', latitude: 91 },
    ];
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detections: [row, ...malformed], truncated: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchMapDetections({ west: -75, south: 4, east: -74, north: 5 }, { species: 'Turdus fuscater', since: new Date('2026-10-01T00:00:00Z') }, 'token', new AbortController().signal);
    expect(result).toEqual({ detections: [row], truncated: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`${API_ROUTES.detections}?`);
    expect(url).toContain('species=Turdus+fuscater');
    expect(url).toContain('since=2026-10-01T00%3A00%3A00.000Z');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token');
  });

  it('rejects failed or malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(fetchMapDetections({ west: 0, south: 0, east: 1, north: 1 }, { species: null, since: null }, 't', new AbortController().signal)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ rows: [] })));
    await expect(fetchMapDetections({ west: 0, south: 0, east: 1, north: 1 }, { species: null, since: null }, 't', new AbortController().signal)).rejects.toThrow();
  });

  // Regression: a server error was reported as "the server did not answer, check the connection".
  it('tells an unusable answer from no answer at all', async () => {
    const failureOf = async (answer: () => Promise<Response>): Promise<MapFailure> => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(answer));
      try {
        await fetchMapDetections({ west: 0, south: 0, east: 1, north: 1 }, { species: null, since: null }, 't', new AbortController().signal);
      } catch (error) {
        return mapFailure(error);
      }
      throw new Error('The request was expected to fail.');
    };
    expect(await failureOf(() => Promise.resolve(new Response(null, { status: 500 })))).toBe('server');
    expect(await failureOf(() => Promise.resolve(Response.json(null)))).toBe('server');
    expect(await failureOf(() => Promise.resolve(new Response('<html>', { status: 200 })))).toBe('server');
    expect(await failureOf(() => Promise.reject(new TypeError('Failed to fetch')))).toBe('network');
  });
});
