/**
 * What a walk amounts to, as plain functions over stored rows: when it ended, which birds were heard along it and
 * where. The same rules as the API (ADR-35), so a walk reads the same on the phone and in the account: discarded
 * songs never count and a corrected one counts as the bird the person heard (the pins already apply both).
 */
import type { StoredWalk } from '../offline/types';
import { WALK_STALE_MS } from './walk.config';
import type { Pin } from './walkPins';

/**
 * Epoch milliseconds when a walk ended, or null while it may still be under way (or nothing tells when it ended).
 * An interrupted walk closes at its last refresh once that is old enough. One from before S10 has no refreshes:
 * it closes at the last song of the run of songs that followed its start, if any.
 */
export function walkEnd(walk: Pick<StoredWalk, 'startedAt' | 'endedAt' | 'lastAt'>, pins: readonly Pick<Pin, 'recordedAt'>[], now: number): number | null {
  const started = Date.parse(walk.startedAt);
  if (walk.endedAt) return Math.max(started, Date.parse(walk.endedAt));
  if (walk.lastAt) {
    const last = Date.parse(walk.lastAt);
    return now - last > WALK_STALE_MS ? Math.max(started, last) : null;
  }
  let end = started;
  for (const time of pins.map((pin) => pin.recordedAt).filter((time) => time >= started).sort((a, b) => a - b)) {
    // A long silence means the walk was over: later songs belong to another session.
    if (time - end > WALK_STALE_MS) break;
    end = time;
  }
  return end > started && now - end > WALK_STALE_MS ? end : null;
}

export interface WalkSpeciesCount {
  /** Scientific name. */
  readonly species: string;
  readonly songs: number;
  readonly bestConfidence: number;
}

/** Where one species was heard during a walk: one cell of the location grid. */
export interface WalkPlace {
  readonly species: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly songs: number;
  readonly bestConfidence: number;
  /** Epoch milliseconds of the first song there. */
  readonly firstAt: number;
}

export interface WalkSongs {
  readonly songs: number;
  /** Most heard first, then by name. */
  readonly species: readonly WalkSpeciesCount[];
  /** In the order they were first heard. */
  readonly places: readonly WalkPlace[];
}

/** The songs heard between `startedAt` and `endedAt` (inclusive), by species and by place. */
export function walkSongs(pins: readonly Pin[], startedAt: number, endedAt: number): WalkSongs {
  const heard = pins.filter((pin) => pin.recordedAt >= startedAt && pin.recordedAt <= endedAt);
  const bySpecies = new Map<string, WalkSpeciesCount>();
  const byPlace = new Map<string, WalkPlace>();
  for (const pin of heard) {
    const counted = bySpecies.get(pin.species);
    bySpecies.set(pin.species, { species: pin.species, songs: (counted?.songs ?? 0) + 1, bestConfidence: Math.max(counted?.bestConfidence ?? 0, pin.confidence) });
    const key = `${pin.species}|${String(pin.latitude)}|${String(pin.longitude)}`;
    const place = byPlace.get(key);
    byPlace.set(key, {
      species: pin.species, latitude: pin.latitude, longitude: pin.longitude, songs: (place?.songs ?? 0) + 1,
      bestConfidence: Math.max(place?.bestConfidence ?? 0, pin.confidence), firstAt: Math.min(place?.firstAt ?? pin.recordedAt, pin.recordedAt),
    });
  }
  const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return {
    songs: heard.length,
    species: [...bySpecies.values()].sort((a, b) => b.songs - a.songs || byName(a.species, b.species)),
    places: [...byPlace.values()].sort((a, b) => a.firstAt - b.firstAt || byName(a.species, b.species)),
  };
}
