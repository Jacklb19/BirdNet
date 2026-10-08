import { describe, expect, it } from 'vitest';
import type { MapDetection } from './mapData';
import { summarizeArea } from './mapSummary';

const detection = (id: string, species: string, recordedAt: string, status: MapDetection['status'] = 'confirmed'): MapDetection => ({
  id, species, confidence: 0.9, status, recorded_at: recordedAt, latitude: 4.679, longitude: -74.123,
});

describe('summarizeArea', () => {
  it('counts each species, keeps its latest time and its detections most recent first', () => {
    const summary = summarizeArea([
      detection('a', 'Turdus fuscater', '2026-10-05T06:00:00Z'),
      detection('b', 'Zonotrichia capensis', '2026-10-06T07:00:00Z', 'provisional'),
      detection('c', 'Turdus fuscater', '2026-10-06T09:30:00Z', 'provisional'),
      detection('d', 'Turdus fuscater', '2026-10-04T18:00:00Z'),
    ]);
    expect(summary.detections).toBe(4);
    const [first, second] = summary.species;
    expect(first?.species).toBe('Turdus fuscater');
    expect(first?.detections).toBe(3);
    expect(first?.provisional).toBe(1);
    expect(first?.lastHeard).toBe(Date.parse('2026-10-06T09:30:00Z'));
    expect(first?.recent.map((row) => row.id)).toEqual(['c', 'a', 'd']);
    expect(second).toMatchObject({ species: 'Zonotrichia capensis', detections: 1, provisional: 1 });
  });

  it('breaks count ties by the most recently heard, then by scientific name', () => {
    const summary = summarizeArea([
      detection('a', 'Colibri coruscans', '2026-10-01T06:00:00Z'),
      detection('b', 'Atlapetes pallidinucha', '2026-10-03T06:00:00Z'),
      detection('c', 'Turdus fuscater', '2026-10-03T06:00:00Z'),
    ]);
    expect(summary.species.map((entry) => entry.species)).toEqual(['Atlapetes pallidinucha', 'Turdus fuscater', 'Colibri coruscans']);
  });

  it('returns an empty list for an area without detections', () => {
    expect(summarizeArea([])).toEqual({ detections: 0, species: [] });
  });
});
