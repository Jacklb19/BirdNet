export type MapPeriod = '7' | '30' | '365' | 'all';
export type MapStatus = 'confirmed' | 'provisional' | 'verified' | 'corrected';

export interface MapDetection {
  id: string;
  species: string;
  confidence: number;
  status: MapStatus;
  recorded_at: string;
  latitude: number;
  longitude: number;
}
export interface MapResult { detections: MapDetection[]; truncated: boolean }
export interface MapBounds { west: number; south: number; east: number; north: number }
export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; species: string; confidence: number; status: MapStatus; recorded_at: string };
}
export interface PointCollection { type: 'FeatureCollection'; features: PointFeature[] }

const configuredBase: unknown = import.meta.env.VITE_API_BASE_URL;
const API_BASE = typeof configuredBase === 'string' && configuredBase ? configuredBase : '/api';
const DAY_MS = 86_400_000;
const STATUSES: readonly MapStatus[] = ['confirmed', 'provisional', 'verified', 'corrected'];

/** Start of the selected period, or null for the entire record. */
export function periodStart(period: MapPeriod, now: Date): Date | null {
  return period === 'all' ? null : new Date(now.getTime() - Number(period) * DAY_MS);
}

/** Clamp to valid ranges: a world-wrapped view would otherwise produce boxes the API rejects. */
export function clampBounds(bounds: MapBounds): MapBounds {
  const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));
  return { west: clamp(bounds.west, 180), south: clamp(bounds.south, 90), east: clamp(bounds.east, 180), north: clamp(bounds.north, 90) };
}

function isDetection(value: unknown): value is MapDetection {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.species === 'string' && typeof row.confidence === 'number' &&
    typeof row.recorded_at === 'string' && typeof row.latitude === 'number' && typeof row.longitude === 'number' &&
    STATUSES.includes(row.status as MapStatus);
}

/** Query the collective map; the response is validated because it crosses a trust boundary. */
export async function fetchMapDetections(bounds: MapBounds, filters: { species: string | null; since: Date | null }, accessToken: string, signal: AbortSignal): Promise<MapResult> {
  const area = clampBounds(bounds);
  const params = new URLSearchParams({ west: String(area.west), south: String(area.south), east: String(area.east), north: String(area.north) });
  if (filters.species) params.set('species', filters.species);
  if (filters.since) params.set('since', filters.since.toISOString());
  const response = await fetch(`${API_BASE}/v1/detections?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  if (!response.ok) throw new Error('Map query failed.');
  const body: unknown = await response.json();
  const rows = (body as { detections?: unknown }).detections;
  if (!Array.isArray(rows) || typeof (body as { truncated?: unknown }).truncated !== 'boolean') throw new Error('Invalid map response.');
  return { detections: rows.filter(isDetection), truncated: (body as { truncated: boolean }).truncated };
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
