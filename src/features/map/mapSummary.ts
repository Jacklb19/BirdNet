import type { MapDetection } from './mapData';

/** One species in the visible area, as the "In this area" list shows it. */
export interface SpeciesSummary {
  readonly species: string;
  readonly detections: number;
  /** Most recent recording, epoch milliseconds. */
  readonly lastHeard: number;
  /** Detections still waiting for verification, so a count never hides how certain it is. */
  readonly provisional: number;
  /** Every detection of the species, most recent first. */
  readonly recent: readonly MapDetection[];
}

export interface AreaSummary {
  readonly detections: number;
  /** Most recorded first; ties go to the most recently heard, then to the scientific name. */
  readonly species: readonly SpeciesSummary[];
}

const recordedAt = (row: MapDetection): number => Date.parse(row.recorded_at);

function summarizeSpecies(species: string, rows: readonly MapDetection[]): SpeciesSummary {
  const recent = [...rows].sort((a, b) => recordedAt(b) - recordedAt(a));
  return {
    species,
    detections: rows.length,
    lastHeard: recent.reduce((latest, row) => Math.max(latest, recordedAt(row)), Number.NEGATIVE_INFINITY),
    provisional: rows.filter((row) => row.status === 'provisional').length,
    recent,
  };
}

/** Per-species aggregation of the detections the map returned for the visible area. */
export function summarizeArea(rows: readonly MapDetection[]): AreaSummary {
  const bySpecies = new Map<string, MapDetection[]>();
  for (const row of rows) {
    const group = bySpecies.get(row.species);
    if (group) group.push(row);
    else bySpecies.set(row.species, [row]);
  }
  const species = [...bySpecies].map(([name, group]) => summarizeSpecies(name, group));
  species.sort((a, b) => b.detections - a.detections || b.lastHeard - a.lastHeard || (a.species < b.species ? -1 : a.species > b.species ? 1 : 0));
  return { detections: rows.length, species };
}
