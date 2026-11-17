import type { MapDetection } from './mapData';
import { detectionCount, groupEncounters } from './mapEncounters';

/** One species in the visible area, as the "In this area" list shows it. */
export interface SpeciesSummary {
  readonly species: string;
  readonly detections: number;
  /** Null when some records only have a summary or a protected location. */
  readonly encounters: number | null;
  /** Most recent recording, epoch milliseconds. */
  readonly lastHeard: number;
  /** Detections still waiting for verification, so a count never hides how certain it is. */
  readonly provisional: number;
  /** Every detection of the species, most recent first. */
  readonly recent: readonly MapDetection[];
}

export interface AreaSummary {
  readonly detections: number;
  readonly encounters: number | null;
  /** Most recorded first; ties go to the most recently heard, then to the scientific name. */
  readonly species: readonly SpeciesSummary[];
}

const recordedAt = (row: MapDetection): number => Date.parse(row.recorded_at);

function summarizeSpecies(species: string, rows: readonly MapDetection[]): SpeciesSummary {
  const recent = [...rows].sort((a, b) => recordedAt(b) - recordedAt(a));
  const encounters = groupEncounters(rows);
  return {
    species,
    detections: rows.reduce((count, row) => count + detectionCount(row), 0),
    encounters: encounters.some((row) => row.kind === 'summary') ? null : encounters.length,
    lastHeard: recent.reduce((latest, row) => Math.max(latest, recordedAt(row)), Number.NEGATIVE_INFINITY),
    provisional: rows.filter((row) => row.summary_count === undefined && row.status === 'provisional').length,
    recent,
  };
}

/** Per-species aggregation of the detections the map returned for the visible area. */
export function summarizeArea(rows: readonly MapDetection[]): AreaSummary {
  const unique = [...new Map([...rows].reverse().map((row) => [row.id, row])).values()];
  const bySpecies = new Map<string, MapDetection[]>();
  for (const row of unique) {
    const group = bySpecies.get(row.species);
    if (group) group.push(row);
    else bySpecies.set(row.species, [row]);
  }
  const species = [...bySpecies].map(([name, group]) => summarizeSpecies(name, group));
  species.sort((a, b) => b.detections - a.detections || b.lastHeard - a.lastHeard || (a.species < b.species ? -1 : a.species > b.species ? 1 : 0));
  return { detections: species.reduce((count, row) => count + row.detections, 0),
    encounters: species.some((row) => row.encounters === null) ? null : species.reduce((count, row) => count + (row.encounters ?? 0), 0), species };
}
