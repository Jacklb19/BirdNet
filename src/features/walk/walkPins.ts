/**
 * The person's own songs as the map draws them, read from what the phone keeps (pending and synchronized), so
 * "my map" works offline and without an account. Plain functions over stored rows.
 */
import type { QueuedDetectionStatus } from '../offline/offline.constants';
import type { HistoryEntry, StoredDetection, StoredWalk } from '../offline/types';
import { trackMeters } from './walkGeometry';

export interface Pin {
  readonly id: string;
  /** Scientific name. */
  readonly species: string;
  readonly confidence: number;
  readonly status: QueuedDetectionStatus;
  /** Epoch milliseconds. */
  readonly recordedAt: number;
  readonly latitude: number;
  readonly longitude: number;
}

type LocatedRow = Pick<StoredDetection, 'id' | 'species' | 'confidence' | 'status' | 'recorded_at'> & Pick<HistoryEntry, 'location'>;

function toPin(row: LocatedRow): Pin | null {
  const recordedAt = Date.parse(row.recorded_at);
  const { location } = row;
  // Device storage is a boundary: a row without a usable place or date is left off the map instead of misplaced.
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !Number.isFinite(recordedAt)) return null;
  return {
    id: row.id, species: row.species, confidence: row.confidence, status: row.status, recordedAt,
    latitude: location.latitude, longitude: location.longitude,
  };
}

/** Every located song on the phone, oldest first. A record acknowledged between both reads appears once. */
export function toPins(pending: readonly StoredDetection[], history: readonly HistoryEntry[]): Pin[] {
  const byId = new Map<string, Pin>();
  for (const row of [...history, ...pending]) {
    const pin = toPin(row);
    if (pin) byId.set(pin.id, pin);
  }
  return [...byId.values()].sort((a, b) => a.recordedAt - b.recordedAt || a.id.localeCompare(b.id));
}

/** Songs recorded during a walk; one still under way lasts until `now`. */
export function pinsOfWalk(pins: readonly Pin[], walk: Pick<StoredWalk, 'startedAt' | 'endedAt'>, now: number): Pin[] {
  const from = Date.parse(walk.startedAt);
  const until = walk.endedAt ? Date.parse(walk.endedAt) : now;
  return pins.filter((pin) => pin.recordedAt >= from && pin.recordedAt <= until);
}

export interface WalkTotals {
  readonly walks: number;
  readonly meters: number;
  readonly songs: number;
  readonly species: number;
}

/** What the person has covered so far: paths walked and everything heard with a place. */
export function walkTotals(walks: readonly Pick<StoredWalk, 'track'>[], pins: readonly Pin[]): WalkTotals {
  return {
    walks: walks.length,
    meters: walks.reduce((total, walk) => total + trackMeters(walk.track), 0),
    songs: pins.length,
    species: new Set(pins.map((pin) => pin.species)).size,
  };
}
