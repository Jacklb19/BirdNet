import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { TrackPoint } from '../offline/types';
import { knownPlumage } from '../species/plumage';
import { hexKey, hexRing, type Territory } from '../walk/walkGeometry';
import { TERRITORY_HEX_METERS } from '../walk/walk.config';
import { MAP_LAYERS, MAP_TOKENS, MAP_TRACK_DASH, MAP_WALK_LAYERS, MAP_WALK_SOURCES } from './map.config';
import { numberToken, pixelToken, token } from './mapLayers';

/** What the person's own map draws under their songs: the paths walked and the explored territories. */
export interface WalkOverlay {
  readonly tracks: readonly (readonly TrackPoint[])[];
  /** Empty while the territory layer is switched off. */
  readonly territories: readonly Territory[];
}

export const NO_WALK_OVERLAY: WalkOverlay = Object.freeze({ tracks: [], territories: [] });

type Feature<G> = { type: 'Feature'; geometry: G; properties: Record<string, string | number> };
type Collection<G> = { type: 'FeatureCollection'; features: Feature<G>[] };
type Line = { type: 'LineString'; coordinates: [number, number][] };
type Polygon = { type: 'Polygon'; coordinates: [number, number][][] };

function trackCollection(tracks: WalkOverlay['tracks']): Collection<Line> {
  return {
    type: 'FeatureCollection',
    // A single cell is not a path yet. GeoJSON wants [longitude, latitude].
    features: tracks.filter((track) => track.length > 1).map((track) => ({
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: track.map(([latitude, longitude]) => [longitude, latitude]) },
    })),
  };
}

/** Each hexagon carries the color of its bird's plate, read from the design tokens. */
function territoryCollection(territories: WalkOverlay['territories']): Collection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: territories.map((territory) => ({
      type: 'Feature',
      properties: { key: hexKey(territory.cell), species: territory.species, color: token(`--plumage-${knownPlumage(territory.species)}`) },
      geometry: { type: 'Polygon', coordinates: [hexRing(territory.cell, TERRITORY_HEX_METERS)] },
    })),
  };
}

/** Added on every style load, before the songs, so paths and territories stay underneath them. */
export function addWalkLayers(map: MapLibreMap, overlay: WalkOverlay): void {
  if (map.getSource(MAP_WALK_SOURCES.tracks)) return;
  const track = { color: token(MAP_TOKENS.track), width: pixelToken(MAP_TOKENS.trackWidth) };
  const territory = { opacity: numberToken(MAP_TOKENS.territoryOpacity), edge: token(MAP_TOKENS.markerStroke), edgeWidth: pixelToken(MAP_TOKENS.markerStrokeWidth) };
  // Under the songs when they are already there (a theme repaint), on top of the basemap otherwise.
  const before = map.getLayer(MAP_LAYERS.clusters) ? MAP_LAYERS.clusters : undefined;

  map.addSource(MAP_WALK_SOURCES.territories, { type: 'geojson', data: territoryCollection(overlay.territories) });
  map.addSource(MAP_WALK_SOURCES.tracks, { type: 'geojson', data: trackCollection(overlay.tracks) });
  map.addLayer({
    id: MAP_WALK_LAYERS.territoryFill, type: 'fill', source: MAP_WALK_SOURCES.territories,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': territory.opacity },
  }, before);
  map.addLayer({
    id: MAP_WALK_LAYERS.territoryEdge, type: 'line', source: MAP_WALK_SOURCES.territories,
    paint: { 'line-color': territory.edge, 'line-width': territory.edgeWidth },
  }, before);
  map.addLayer({
    id: MAP_WALK_LAYERS.tracks, type: 'line', source: MAP_WALK_SOURCES.tracks,
    // Round caps turn the short dashes into the dots of a trail.
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': track.color, 'line-width': track.width, 'line-dasharray': [...MAP_TRACK_DASH] },
  }, before);
}

export function setWalkOverlay(map: MapLibreMap, overlay: WalkOverlay): void {
  // Before the style has loaded there are no sources; `addWalkLayers` then starts from the latest overlay.
  void map.getSource<GeoJSONSource>(MAP_WALK_SOURCES.territories)?.setData(territoryCollection(overlay.territories));
  void map.getSource<GeoJSONSource>(MAP_WALK_SOURCES.tracks)?.setData(trackCollection(overlay.tracks));
}

/** Draws the layers again with the tokens of the theme now applied (both themes share one basemap style). */
export function repaintWalkLayers(map: MapLibreMap, overlay: WalkOverlay): void {
  if (!map.getSource(MAP_WALK_SOURCES.tracks)) return;
  for (const id of Object.values(MAP_WALK_LAYERS)) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of Object.values(MAP_WALK_SOURCES)) map.removeSource(id);
  addWalkLayers(map, overlay);
}
