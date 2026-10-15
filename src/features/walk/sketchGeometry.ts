/**
 * The drawing of a walk as plain geometry: its cells projected on a small canvas, north up, with the same scale on
 * both axes, so the shape on screen is the shape walked. No map tiles: it works offline and costs nothing.
 */
import type { TrackPoint } from '../offline/types';

export interface SketchPoint { readonly x: number; readonly y: number }

export interface Sketch {
  readonly path: readonly SketchPoint[];
  readonly marks: readonly SketchPoint[];
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Fits the path and the marks (places where a bird was heard) inside `width` × `height`, leaving `padding` on
 * every side. Longitudes shrink with the cosine of the latitude, as the ground does; a single point sits centred.
 */
export function sketchWalk(track: readonly TrackPoint[], marks: readonly { readonly latitude: number; readonly longitude: number }[],
  width: number, height: number, padding: number): Sketch {
  const all = [...track.map((point) => ({ latitude: point[0], longitude: point[1] })), ...marks];
  if (all.length === 0) return { path: [], marks: [] };
  const latitudes = all.map((point) => point.latitude);
  const longitudes = all.map((point) => point.longitude);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const squeeze = Math.cos(toRadians((north + south) / 2));
  const spanX = (east - west) * squeeze;
  const spanY = north - south;
  const room = { x: width - 2 * padding, y: height - 2 * padding };
  // The larger span fills its side; a walk that never left one cell has no span and is simply centred.
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX === 0 ? Infinity : room.x / spanX, spanY === 0 ? Infinity : room.y / spanY);
  const offset = { x: (width - spanX * scale) / 2, y: (height - spanY * scale) / 2 };
  const project = (latitude: number, longitude: number): SketchPoint => ({
    x: offset.x + (longitude - west) * squeeze * scale,
    y: offset.y + (north - latitude) * scale,
  });
  return {
    path: track.map((point) => project(point[0], point[1])),
    marks: marks.map((mark) => project(mark.latitude, mark.longitude)),
  };
}
