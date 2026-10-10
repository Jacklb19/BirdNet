import { describe, expect, it } from 'vitest';
import { logInsights, walkSummaries } from './logInsights';

const at = (day: number, hour: number): number => new Date(2026, 9, day, hour, 15).getTime();
const NOW = at(10, 12);

describe('log insights', () => {
  it('reports nothing for an empty log', () => {
    expect(logInsights([], NOW)).toEqual({ songs: 0, species: 0, newSpecies: [], busiestHour: null });
  });

  it('counts a species as new only when its first record is within the week', () => {
    const insights = logInsights([
      { species: 'Turdus fuscater', recordedAt: at(1, 6) },
      { species: 'Turdus fuscater', recordedAt: at(9, 6) },
      { species: 'Colibri coruscans', recordedAt: at(8, 6) },
      { species: 'Zonotrichia capensis', recordedAt: at(9, 7) },
    ], NOW);
    expect(insights).toMatchObject({ songs: 4, species: 3, newSpecies: ['Zonotrichia capensis', 'Colibri coruscans'] });
  });

  it('names the local hour with most songs, the earliest on a tie', () => {
    const insights = logInsights([
      { species: 'a', recordedAt: at(9, 17) }, { species: 'a', recordedAt: at(9, 17) },
      { species: 'a', recordedAt: at(9, 6) }, { species: 'b', recordedAt: at(8, 6) },
      { species: 'a', recordedAt: at(9, 12) },
    ], NOW);
    expect(insights.busiestHour).toBe(6);
  });
});

describe('walk summaries', () => {
  const walk = (id: string, start: number, end: number | null) => ({
    id, startedAt: new Date(start).toISOString(), endedAt: end === null ? null : new Date(end).toISOString(),
    track: [[4.65, -74.09], [4.66, -74.09]] as [number, number][],
  });

  it('attributes to each walk the songs heard while it lasted, newest walk first', () => {
    const summaries = walkSummaries(
      [walk('old', at(8, 6), at(8, 7)), walk('new', at(9, 6), at(9, 8))],
      [
        { species: 'a', recordedAt: at(8, 6) + 60_000 }, { species: 'a', recordedAt: at(9, 6) + 60_000 },
        { species: 'b', recordedAt: at(9, 7) }, { species: 'c', recordedAt: at(9, 9) },
      ],
    );
    expect(summaries.map((summary) => summary.id)).toEqual(['new', 'old']);
    expect(summaries[0]).toMatchObject({ songs: 2, species: 2, durationMs: 2 * 3_600_000 });
    expect(summaries[0]?.meters).toBeCloseTo(1111.95, 0);
    expect(summaries[1]).toMatchObject({ songs: 1, species: 1 });
  });

  it('attributes no songs to a walk that was never closed', () => {
    const [summary] = walkSummaries([walk('open', at(9, 6), null)], [{ species: 'a', recordedAt: at(9, 7) }]);
    expect(summary).toMatchObject({ durationMs: null, songs: 0, species: 0 });
  });
});
