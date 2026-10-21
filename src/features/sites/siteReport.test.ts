import { describe, expect, it } from 'vitest';
import { parseReport, reportNames, type SiteStats } from './sitesApi';

const stats: SiteStats = {
  period: 'month', since: '2026-09-21T15:00:00Z', until: '2026-10-21T15:00:00Z', species_count: 3, previous_species_count: 2,
  detections: 12, active_days: 4, hourly: Array.from({ length: 24 }, (_, hour) => (hour === 6 ? 12 : 0)),
  species: [
    { species: 'Turdus fuscater', detections: 8, days: 4, first_seen: '2026-09-01T11:00:00Z', is_new: false },
    { species: 'Zonotrichia capensis', detections: 3, days: 2, first_seen: '2026-10-10T11:00:00Z', is_new: true },
    { species: 'Colibri coruscans', detections: 1, days: 1, first_seen: '2026-10-11T11:00:00Z', is_new: true },
  ],
  missing: ['Sturnella magna'],
};

describe('names sent with a site report', () => {
  it('sends the names the app shows and leaves out those the API would refuse', () => {
    const shown: Record<string, string> = {
      'Turdus fuscater': 'Mirla patiamarilla', 'Zonotrichia capensis': 'Copetón', 'Sturnella magna': 'Chirlobirlo (oriental)',
      'Colibri coruscans': 'Colibrí 2',
    };
    expect(reportNames(stats, (species) => shown[species] ?? species)).toEqual({
      'Turdus fuscater': 'Mirla patiamarilla', 'Zonotrichia capensis': 'Copetón', 'Sturnella magna': 'Chirlobirlo (oriental)',
    });
  });

  it('does not send a scientific name back as a common one', () => {
    expect(reportNames(stats, (species) => species)).toEqual({});
  });
});

describe('a written report from the API', () => {
  const body = { paragraphs: ['Se oyeron 12 cantos.'], stats, generated_at: '2026-10-21T15:00:00Z', stale: false, model: 'm', period: 'month', locale: 'es' };

  it('keeps the figures it was written from', () => {
    expect(parseReport(body)).toEqual({ paragraphs: ['Se oyeron 12 cantos.'], stats, generatedAt: '2026-10-21T15:00:00Z', stale: false });
  });

  it('is never drawn when a part is missing or malformed', () => {
    expect(() => parseReport({ ...body, paragraphs: [] })).toThrow();
    expect(() => parseReport({ ...body, paragraphs: ['  '] })).toThrow();
    expect(() => parseReport({ ...body, stats: { ...stats, hourly: [1] } })).toThrow();
    expect(() => parseReport({ ...body, stale: 'no' })).toThrow();
  });
});
