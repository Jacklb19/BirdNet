/**
 * The person's own map as plain data: their located songs in the shape the map draws, and the paths of their
 * walks. Read from the phone, plus the walks that are only in their account (S11). It has no period filter: it is
 * small, and all of it is theirs.
 */
import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import type { StoredWalk, TrackPoint } from '../offline/types';
import type { AccountWalkPath } from '../walk/walksApi';
import type { Pin } from '../walk/walkPins';
import type { MapDetection, MapResult } from './mapData';

export interface OwnMapFilter {
  readonly species: string | null;
  /** A walk is under way: its stored copy is left out, because the live path is drawn instead. */
  readonly walking: boolean;
}

export interface OwnMap {
  readonly result: MapResult;
  readonly tracks: readonly (readonly TrackPoint[])[];
  /** Every species the person has located, whatever the filter, for the filter's options. */
  readonly speciesOptions: readonly string[];
}

function toDetection(pin: Pin): MapDetection {
  return {
    id: pin.id, species: pin.species, confidence: pin.confidence, status: pin.status,
    recorded_at: new Date(pin.recordedAt).toISOString(), latitude: pin.latitude, longitude: pin.longitude,
    // The place name is the server's to give; the phone only knows the cell.
    own: true, site_name: null, generalized_m: null,
  };
}

/**
 * Where a species was heard on a walk of the account, as one of the person's songs: the best confidence of that place,
 * and the state that confidence gives on the phone. Its id cannot collide with a detection's.
 */
function placeDetection(walk: AccountWalkPath, index: number): MapDetection | null {
  const place = walk.places[index];
  if (!place) return null;
  return {
    id: `${walk.id}:${String(index)}`, species: place.species, confidence: place.bestConfidence,
    status: place.bestConfidence >= CONFIDENCE_THRESHOLDS.confirmedFrom ? 'confirmed' : 'provisional',
    recorded_at: new Date(place.firstAt).toISOString(), latitude: place.latitude, longitude: place.longitude,
    own: true, site_name: null, generalized_m: null,
  };
}

const cellKey = (species: string, latitude: number, longitude: number): string => `${species}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;

export function ownMap(pins: readonly Pin[], walks: readonly StoredWalk[], filter: OwnMapFilter, accountWalks: readonly AccountWalkPath[] = []): OwnMap {
  // Walks on the phone are drawn from the phone; only the others come from the account, and a place whose song the
  // phone still has is drawn once.
  const onPhone = new Set(walks.map((walk) => walk.id));
  const fromAccount = accountWalks.filter((walk) => !onPhone.has(walk.id));
  const seen = new Set(pins.map((pin) => cellKey(pin.species, pin.latitude, pin.longitude)));
  const places = fromAccount.flatMap((walk) => walk.places.map((_, index) => placeDetection(walk, index)))
    .filter((row): row is MapDetection => row !== null && !seen.has(cellKey(row.species, row.latitude, row.longitude)));
  const detections = [...pins.map(toDetection), ...places].filter((row) => filter.species === null || row.species === filter.species);
  const tracks = [
    ...walks.filter((walk) => !(filter.walking && walk.endedAt === null)).map((walk) => walk.track),
    ...fromAccount.map((walk) => walk.track),
  ];
  return {
    result: { detections, truncated: false },
    tracks,
    speciesOptions: [...new Set([...pins.map((pin) => pin.species), ...places.map((row) => row.species)])].sort((a, b) => a.localeCompare(b)),
  };
}

/** Corners [west, south, east, north] that frame the songs and paths; null when there is nothing to frame. */
export function ownExtent(map: Pick<OwnMap, 'result' | 'tracks'>): [number, number, number, number] | null {
  const points: [number, number][] = [
    ...map.result.detections.map((row): [number, number] => [row.longitude, row.latitude]),
    ...map.tracks.flatMap((track) => track.map(([latitude, longitude]): [number, number] => [longitude, latitude])),
  ];
  if (points.length === 0) return null;
  const longitudes = points.map((point) => point[0]);
  const latitudes = points.map((point) => point[1]);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}
