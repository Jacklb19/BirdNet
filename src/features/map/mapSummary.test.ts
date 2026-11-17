import { describe, expect, it } from 'vitest';
import type { MapDetection } from './mapData';
import { summarizeArea } from './mapSummary';

const detection = (id: string, species: string, recordedAt: string, status: MapDetection['status'] = 'confirmed'): MapDetection => ({
  id, species, confidence: 0.9, status, recorded_at: recordedAt, latitude: 4.679, longitude: -74.123, own: false, site_name: null, generalized_m: null,
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
    expect(summarizeArea([])).toEqual({ detections: 0, encounters: 0, species: [] });
  });

  it('separates repeated detections from encounter totals and keeps every review', () => {
    const rows = [0, 1, 2, 3, 4].map((minute) => detection(String(minute), 'Turdus fuscater', `2026-10-05T06:0${String(minute)}:00Z`, minute === 2 ? 'provisional' : 'verified'));
    const summary = summarizeArea([...rows, ...rows.slice(0, 1)]);
    expect(summary).toMatchObject({ detections: 5, encounters: 1 });
    expect(summary.species[0]).toMatchObject({ detections: 5, encounters: 1, provisional: 1 });
    expect(summary.species[0]?.recent).toHaveLength(5);
  });

  it('does not estimate encounters or invent reviews from an incomplete account summary', () => {
    const row = { ...detection('summary', 'Turdus fuscater', '2026-10-05T06:00:00Z', 'provisional'), summary_count: 12 };
    expect(summarizeArea([row])).toMatchObject({ detections: 12, encounters: null, species: [{ provisional: 0, encounters: null }] });
  });
});
