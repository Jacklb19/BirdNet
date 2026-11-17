import { distanceMeters, EARTH_RADIUS_M } from '../walk/walkGeometry';
import { MAP_ENCOUNTERS } from './map.config';
import type { MapDetection } from './mapData';

/** A reversible view of records, never an inferred bird or a new stored detection. */
export interface MapEncounter extends MapDetection {
  readonly kind: 'encounter' | 'summary';
  readonly members: readonly MapDetection[];
  readonly detectionCount: number;
  readonly lastRecordedAt: string;
}

interface Group {
  readonly anchor: MapDetection;
  readonly members: MapDetection[];
  readonly kind: MapEncounter['kind'];
  lastAt: number;
}

export const detectionCount = (row: MapDetection): number => row.summary_count ?? 1;
const byTime = (a: MapDetection, b: MapDetection): number =>
  Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.id.localeCompare(b.id, 'en');

/** Earth-centred buckets work across the date line and near the poles, unlike longitude-based cells. */
function bucket(row: MapDetection): readonly [number, number, number] {
  const latitude = row.latitude * Math.PI / 180;
  const longitude = row.longitude * Math.PI / 180;
  const scale = EARTH_RADIUS_M / MAP_ENCOUNTERS.radiusMeters;
  return [Math.floor(scale * Math.cos(latitude) * Math.cos(longitude)),
    Math.floor(scale * Math.cos(latitude) * Math.sin(longitude)), Math.floor(scale * Math.sin(latitude))];
}

function finish(group: Group): MapEncounter {
  const { anchor, members, kind } = group;
  // An aggregate must not borrow the best member's human review. Mixed states stay provisional on the dot;
  // every original confidence and review remains available in the details.
  const status = members.every((row) => row.status === anchor.status) ? anchor.status : 'provisional';
  return { ...anchor, id: `encounter:${anchor.id}`, kind, members, status,
    confidence: members.reduce((best, row) => Math.max(best, row.confidence), 0),
    detectionCount: members.reduce((count, row) => count + detectionCount(row), 0),
    lastRecordedAt: new Date(group.lastAt).toISOString() };
}

/**
 * Same species, within the radius of a fixed first observation, with no gap longer than the configured limit.
 * The fixed anchor prevents a chain of nearby calls from swallowing an entire route. No averaging moves the
 * observer's saved cell. Protected locations and incomplete walk summaries cannot support spatial encounters.
 */
export function groupEncounters(rows: readonly MapDetection[]): MapEncounter[] {
  const unique = [...new Map([...rows].reverse().map((row) => [row.id, row])).values()].sort(byTime);
  const groups: Group[] = [];
  const buckets = new Map<string, Group[]>();
  const protectedAreas = new Map<string, Group>();
  for (const row of unique) {
    const at = Date.parse(row.recorded_at);
    if (row.summary_count !== undefined || row.generalized_m !== null) {
      // All protected records in one published cell are a summary, not separate acoustic locations.
      const key = JSON.stringify([row.species, row.latitude, row.longitude, row.generalized_m]);
      const previous = row.summary_count === undefined ? protectedAreas.get(key) : undefined;
      if (previous) { previous.members.push(row); previous.lastAt = at; }
      else {
        const group: Group = { anchor: row, members: [row], kind: 'summary', lastAt: at };
        groups.push(group);
        if (row.summary_count === undefined) protectedAreas.set(key, group);
      }
      continue;
    }
    const scope = JSON.stringify([row.species, row.own]);
    const [x, y, z] = bucket(row);
    let nearest: Group | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const key = JSON.stringify([scope, x + dx, y + dy, z + dz]);
      const active = buckets.get(key)?.filter((group) => at - group.lastAt <= MAP_ENCOUNTERS.maxGapMs);
      if (!active?.length) { buckets.delete(key); continue; }
      buckets.set(key, active);
      for (const group of active) {
        const distance = distanceMeters([row.latitude, row.longitude], [group.anchor.latitude, group.anchor.longitude]);
        if (distance <= MAP_ENCOUNTERS.radiusMeters && (distance < nearestDistance ||
          (distance === nearestDistance && nearest && byTime(group.anchor, nearest.anchor) < 0))) {
          nearest = group;
          nearestDistance = distance;
        }
      }
    }
    if (nearest) { nearest.members.push(row); nearest.lastAt = at; }
    else {
      const group: Group = { anchor: row, members: [row], kind: 'encounter', lastAt: at };
      groups.push(group);
      const key = JSON.stringify([scope, x, y, z]);
      const cell = buckets.get(key) ?? [];
      cell.push(group);
      buckets.set(key, cell);
    }
  }
  return groups.map(finish);
}
