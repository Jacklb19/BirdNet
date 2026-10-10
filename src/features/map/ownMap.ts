/**
 * The person's own map as plain data: their located songs in the shape the map draws, and the paths of their
 * walks. Read from the phone, never from the server. It has no period filter: it is small, and all of it is theirs.
 */
import type { StoredWalk, TrackPoint } from '../offline/types';
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
    own: true, site_name: null,
  };
}

export function ownMap(pins: readonly Pin[], walks: readonly StoredWalk[], filter: OwnMapFilter): OwnMap {
  const detections = pins.filter((pin) => filter.species === null || pin.species === filter.species).map(toDetection);
  const tracks = walks.filter((walk) => !(filter.walking && walk.endedAt === null)).map((walk) => walk.track);
  return {
    result: { detections, truncated: false },
    tracks,
    speciesOptions: [...new Set(pins.map((pin) => pin.species))].sort((a, b) => a.localeCompare(b)),
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
