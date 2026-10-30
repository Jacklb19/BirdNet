import { useEffect, useState } from 'react';
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
export function useAccountSongs(token: string | null, userId: string | null, online: boolean): readonly MapDetection[] {
  const [loaded, setLoaded] = useState<{ readonly userId: string; readonly songs: readonly MapDetection[] } | null>(null);
  const known = loaded !== null && loaded.userId === userId;

  useEffect(() => {
    // Read once per account and visit; a token refresh alone does not read it again.
    if (!token || !userId || !online || known) return;
    const controller = new AbortController();
    void (async () => {
      const songs: MapDetection[] = [];
      let before: string | null = null;
      for (;;) {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        const body = await (await apiFetch(API_ROUTES.meDetections, { token, params, signal: controller.signal })).json() as { detections?: unknown; has_more?: unknown };
        if (!Array.isArray(body.detections) || typeof body.has_more !== 'boolean') throw new Error('Invalid songs of the account.');
        songs.push(...body.detections.map(parseOwnSong).filter((song): song is MapDetection => song !== null));
        const last = songs.at(-1);
        if (!body.has_more || !last || songs.length >= MAP_ACCOUNT_SONGS) break;
        before = last.recorded_at;
      }
      setLoaded({ userId, songs: songs.slice(0, MAP_ACCOUNT_SONGS) });
    })().catch(() => undefined);
    return () => { controller.abort(); };
  }, [token, userId, online, known]);

  return known ? loaded.songs : NONE;
}
