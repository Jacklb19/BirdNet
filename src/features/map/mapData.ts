import { API_ROUTES, ApiError, apiFetch } from '../../config/api';
import { isDetectionStatus, periodDays, type DetectionStatus, type Period } from '../../config/contract';

export interface MapDetection {
  id: string;
  species: string;
  confidence: number;
  status: DetectionStatus;
  recorded_at: string;
  latitude: number;
  longitude: number;
}
export interface MapResult { detections: MapDetection[]; truncated: boolean }
export interface MapBounds { west: number; south: number; east: number; north: number }
export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; species: string; confidence: number; status: DetectionStatus; recorded_at: string };
}
export interface PointCollection { type: 'FeatureCollection'; features: PointFeature[] }

const MS_PER_DAY = 86_400_000;
const MAX_LONGITUDE = 180;
const MAX_LATITUDE = 90;

/** Start of the selected period, or null for the entire record. */
export function periodStart(period: Period, now: Date): Date | null {
  const days = periodDays(period);
  return days === null ? null : new Date(now.getTime() - days * MS_PER_DAY);
}

/** Clamp to valid ranges: a world-wrapped view would otherwise produce boxes the API rejects. */
export function clampBounds(bounds: MapBounds): MapBounds {
  const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));
  return {
    west: clamp(bounds.west, MAX_LONGITUDE), south: clamp(bounds.south, MAX_LATITUDE),
    east: clamp(bounds.east, MAX_LONGITUDE), north: clamp(bounds.north, MAX_LATITUDE),
  };
}

const inRange = (value: unknown, minimum: number, maximum: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

/** Rows the interface could not show truthfully (no date to order by, a score outside 0-1, no place) are dropped. */
function isDetection(value: unknown): value is MapDetection {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.species === 'string' && inRange(row.confidence, 0, 1) &&
    typeof row.recorded_at === 'string' && Number.isFinite(Date.parse(row.recorded_at)) &&
    inRange(row.latitude, -MAX_LATITUDE, MAX_LATITUDE) && inRange(row.longitude, -MAX_LONGITUDE, MAX_LONGITUDE) &&
    isDetectionStatus(row.status);
}

/** The server answered with a body that does not follow the map contract. */
export class MapResponseError extends Error {
  constructor() {
    super('Invalid map response.');
    this.name = 'MapResponseError';
  }
}

/** Query the collective map; the response is validated because it crosses a trust boundary. */
export async function fetchMapDetections(bounds: MapBounds, filters: { species: string | null; since: Date | null }, accessToken: string, signal: AbortSignal): Promise<MapResult> {
  const area = clampBounds(bounds);
  const params = new URLSearchParams({ west: String(area.west), south: String(area.south), east: String(area.east), north: String(area.north) });
  if (filters.species) params.set('species', filters.species);
  if (filters.since) params.set('since', filters.since.toISOString());
  const response = await apiFetch(API_ROUTES.detections, { token: accessToken, params, signal });
  const body: unknown = await response.json();
  // A null or scalar body is a broken contract too, not a crash while reading its fields.
  const { detections: rows, truncated } = (typeof body === 'object' && body !== null ? body : {}) as { detections?: unknown; truncated?: unknown };
  if (!Array.isArray(rows) || typeof truncated !== 'boolean') throw new MapResponseError();
  return { detections: rows.filter(isDetection), truncated };
}

/** Why a request failed: no answer at all (connection, timeout) or an answer that cannot be used. */
export type MapFailure = 'network' | 'server';

/** Tells the two apart, so a server error is not reported as a connection problem. */
export function mapFailure(error: unknown): MapFailure {
  return error instanceof ApiError || error instanceof MapResponseError || error instanceof SyntaxError ? 'server' : 'network';
}

/** GeoJSON for MapLibre's native clustering; coordinates are [longitude, latitude]. */
export function toFeatureCollection(rows: readonly MapDetection[]): PointCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      properties: { id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at },
    })),
  };
}

/** Distinct species in a result set, alphabetically, for the filter options. */
export function speciesOptions(rows: readonly MapDetection[]): string[] {
  return [...new Set(rows.map((row) => row.species))].sort((a, b) => a.localeCompare(b));
}
