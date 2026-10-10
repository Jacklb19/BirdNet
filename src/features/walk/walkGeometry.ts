/**
 * Geometry of the walk mode as plain functions: the walked path, its length, and the hexagonal territories the
 * songs fall into. No React, no storage and no map library, so every rule is testable.
 */
import type { ApproximateLocation, TrackPoint } from '../offline/types';

/** Mean Earth radius (IUGG), in metres. */
const EARTH_RADIUS_M = 6_371_008.8;
/** Radius of the Web Mercator sphere (WGS 84 semi-major axis), in metres. */
const MERCATOR_RADIUS_M = 6_378_137;
const HEX_CORNERS = 6;
const SQRT_3 = Math.sqrt(3);

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/** Great-circle distance between two cells, in metres (haversine). */
export function distanceMeters(from: TrackPoint, to: TrackPoint): number {
  const latitudeDelta = toRadians(to[0] - from[0]);
  const longitudeDelta = toRadians(to[1] - from[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from[0])) * Math.cos(toRadians(to[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Adds the cell the person is in to the path. Standing still keeps reporting the same cell, which adds nothing;
 * the same array is then returned, so callers can tell by identity. A full path stops growing.
 */
export function appendTrackPoint(track: readonly TrackPoint[], cell: ApproximateLocation, limit: number): readonly TrackPoint[] {
  const last = track.at(-1);
  if (last?.[0] === cell.latitude && last[1] === cell.longitude) return track;
  if (track.length >= limit) return track;
  return [...track, [cell.latitude, cell.longitude]];
}

/** Length of a path, in metres. */
export function trackMeters(track: readonly TrackPoint[]): number {
  let total = 0;
  for (let index = 1; index < track.length; index++) {
    const from = track[index - 1];
    const to = track[index];
    if (from && to) total += distanceMeters(from, to);
  }
  return total;
}

/** A hexagon of the territory grid, in axial coordinates (pointy-top hexagons on the Web Mercator plane). */
export interface HexCell { readonly q: number; readonly r: number }

function toMercator(latitude: number, longitude: number): [number, number] {
  return [MERCATOR_RADIUS_M * toRadians(longitude), MERCATOR_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2))];
}

function fromMercator(x: number, y: number): [number, number] {
  return [toDegrees(x / MERCATOR_RADIUS_M), toDegrees(2 * Math.atan(Math.exp(y / MERCATOR_RADIUS_M)) - Math.PI / 2)];
}

/** The hexagon a location falls into; `size` is the circumradius in Mercator metres. */
export function hexOf(location: ApproximateLocation, size: number): HexCell {
  const [x, y] = toMercator(location.latitude, location.longitude);
  const q = ((SQRT_3 / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  // Cube rounding: the coordinate with the largest rounding error is rebuilt from the other two.
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const roundedS = Math.round(s);
  const errorQ = Math.abs(roundedQ - q);
  const errorR = Math.abs(roundedR - r);
  const errorS = Math.abs(roundedS - s);
  if (errorQ > errorR && errorQ > errorS) roundedQ = -roundedR - roundedS;
  else if (errorR > errorS) roundedR = -roundedQ - roundedS;
  // `+ 0` turns a negative zero into zero, so equal cells always have equal keys.
  return { q: roundedQ + 0, r: roundedR + 0 };
}

export function hexKey(cell: HexCell): string {
  return `${String(cell.q)},${String(cell.r)}`;
}

/** Outline of a hexagon as a closed ring of [longitude, latitude], the order GeoJSON uses. */
export function hexRing(cell: HexCell, size: number): [number, number][] {
  const centerX = size * SQRT_3 * (cell.q + cell.r / 2);
  const centerY = size * 1.5 * cell.r;
  const ring: [number, number][] = [];
  for (let corner = 0; corner <= HEX_CORNERS; corner++) {
    const angle = toRadians(60 * (corner % HEX_CORNERS) - 30);
    ring.push(fromMercator(centerX + size * Math.cos(angle), centerY + size * Math.sin(angle)));
  }
  return ring;
}

/** A song with a place: what territories are made of. */
export interface LocatedSong { readonly species: string; readonly latitude: number; readonly longitude: number }

/** One explored hexagon: whose it is (the bird heard most in it) and how much was heard there. */
export interface Territory {
  readonly cell: HexCell;
  /** Scientific name of the species with most songs here; ties go to the first in alphabetical order. */
  readonly species: string;
  readonly songs: number;
  readonly speciesCount: number;
}

/** Groups located songs into hexagons. A hexagon without songs is simply absent: nothing is known about it. */
export function territories(songs: readonly LocatedSong[], size: number): Territory[] {
  const cells = new Map<string, { cell: HexCell; counts: Map<string, number> }>();
  for (const song of songs) {
    const cell = hexOf(song, size);
    const key = hexKey(cell);
    const entry = cells.get(key) ?? { cell, counts: new Map<string, number>() };
    entry.counts.set(song.species, (entry.counts.get(song.species) ?? 0) + 1);
    cells.set(key, entry);
  }
  return [...cells.values()].map(({ cell, counts }) => {
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return {
      cell,
      species: ranked[0]?.[0] ?? '',
      songs: ranked.reduce((total, [, count]) => total + count, 0),
      speciesCount: ranked.length,
    };
  });
}
