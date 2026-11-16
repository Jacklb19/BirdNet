import { useAccountResource, type AccountResource } from '../../shared/useAccountResource';
import { API_ROUTES, apiFetch } from '../../config/api';
import { isDetectionStatus } from '../../config/contract';
import { MAP_ACCOUNT_SONGS } from './map.config';
import type { MapDetection } from './mapData';

const NONE: readonly MapDetection[] = Object.freeze([]);

const isCoordinate = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/** One located song of the account, or null when the answer does not follow the contract. */
export function parseOwnSong(value: unknown): MapDetection | null {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row.id !== 'string' || typeof row.species !== 'string' || typeof row.confidence !== 'number' || !isDetectionStatus(row.status)
      || typeof row.recorded_at !== 'string' || Number.isNaN(Date.parse(row.recorded_at)) || !isCoordinate(row.latitude, 90) || !isCoordinate(row.longitude, 180)) {
    return null;
  }
  return { id: row.id, species: row.species, confidence: row.confidence, status: row.status, recorded_at: row.recorded_at, latitude: row.latitude,
    longitude: row.longitude, own: true, site_name: null, generalized_m: null };
}

/**
 * The account's located songs, for "Mi mapa" to draw those this phone does not keep: synchronized before the phone kept
 * their cell (before S8), or recorded on another phone. Kept in memory only; without a session or a connection the map
 * shows what the phone has.
 */
async function load(token: string, signal: AbortSignal): Promise<{ data: readonly MapDetection[]; limited: boolean }> {
  const songs: MapDetection[] = [];
  const params = new URLSearchParams();
  const cursors = new Set<string>();
  for (;;) {
    const body = await (await apiFetch(API_ROUTES.meDetections, { token, params, signal })).json() as { detections?: unknown; has_more?: unknown };
    if (!Array.isArray(body.detections) || typeof body.has_more !== 'boolean') throw new Error('Invalid songs of the account.');
    const page = body.detections.map(parseOwnSong);
    const last = page.at(-1);
    songs.push(...page.filter((song): song is MapDetection => song !== null));
    if (!body.has_more || songs.length >= MAP_ACCOUNT_SONGS) return { data: songs.slice(0, MAP_ACCOUNT_SONGS), limited: body.has_more || songs.length > MAP_ACCOUNT_SONGS };
    if (!last || cursors.has(last.id)) throw new Error('Song pagination did not advance.');
    cursors.add(last.id);
    params.set('before', last.recorded_at);
    params.set('after_id', last.id);
  }
}

export function useAccountSongs(token: string | null, userId: string | null, online: boolean): AccountResource<readonly MapDetection[]> {
  return useAccountResource(token, userId, online, NONE, load);
}
