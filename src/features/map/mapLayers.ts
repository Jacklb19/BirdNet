import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { DETECTION_STATUSES } from '../../config/contract';
import { intlTag, type Locale } from '../../i18n';
import { toFeatureCollection, type MapResult } from './mapData';
import { MAP_CLUSTER, MAP_LABEL_FONT, MAP_LAYERS, MAP_SOURCE_ID, MAP_TOKENS, STATUS_COLOR_TOKEN } from './map.config';

/** MapLibre paints on a canvas, so colors and sizes are read from the active theme's design tokens. */
function token(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Design token ${name} is not defined; src/styles/tokens.css must be loaded.`);
  return value;
}

/** Map size tokens are declared in px, the unit MapLibre paint properties use. */
function pixelToken(name: string): number {
  const value = token(name);
  const pixels = Number.parseFloat(value);
  if (!value.endsWith('px') || !Number.isFinite(pixels)) throw new Error(`Design token ${name} must be a length in px.`);
  return pixels;
}

function statusColor(): ExpressionSpecification {
  const [first, ...others] = DETECTION_STATUSES;
  return ['match', ['get', 'status'],
    first, token(STATUS_COLOR_TOKEN[first]),
    ...others.flatMap((status) => [status, token(STATUS_COLOR_TOKEN[status])]),
    // Rows are validated against DETECTION_STATUSES, so this never shows; provisional is the cautious reading.
    token(STATUS_COLOR_TOKEN.provisional)];
}

/** Layers are re-added on every style load so a theme switch keeps clusters and colors in sync. */
export function addDetectionLayers(map: MapLibreMap, result: MapResult | null, locale: Locale): void {
  if (map.getSource(MAP_SOURCE_ID)) return;
  // Read every token first: a missing one then fails before anything is added, not with half the layers.
  const stroke = { color: token(MAP_TOKENS.markerStroke), width: pixelToken(MAP_TOKENS.markerStrokeWidth) };
  const clusterRadius: ExpressionSpecification = ['step', ['get', 'point_count'],
    pixelToken(MAP_TOKENS.clusterRadiusSmall),
    MAP_CLUSTER.sizeBreakpoints.medium, pixelToken(MAP_TOKENS.clusterRadiusMedium),
    MAP_CLUSTER.sizeBreakpoints.large, pixelToken(MAP_TOKENS.clusterRadiusLarge)];
  const cluster = { fill: token(MAP_TOKENS.clusterFill), label: token(MAP_TOKENS.clusterLabel), labelSize: pixelToken(MAP_TOKENS.labelSize) };
  const point = { radius: pixelToken(MAP_TOKENS.pointRadius), color: statusColor() };

  map.addSource(MAP_SOURCE_ID, {
    type: 'geojson', data: toFeatureCollection(result?.detections ?? []), cluster: true,
    clusterRadius: MAP_CLUSTER.radiusPx, clusterMaxZoom: MAP_CLUSTER.maxZoom,
  });
  map.addLayer({
    id: MAP_LAYERS.clusters, type: 'circle', source: MAP_SOURCE_ID, filter: ['has', 'point_count'],
    paint: { 'circle-color': cluster.fill, 'circle-stroke-color': stroke.color, 'circle-stroke-width': stroke.width, 'circle-radius': clusterRadius },
  });
  map.addLayer({
    id: MAP_LAYERS.clusterCount, type: 'symbol', source: MAP_SOURCE_ID, filter: ['has', 'point_count'],
    // Counts in the language's digits and separators, as everywhere else; MapLibre's own abbreviation is English ("1.2k").
    layout: {
      'text-field': ['number-format', ['get', 'point_count'], { locale: intlTag(locale) }],
      'text-font': [...MAP_LABEL_FONT], 'text-size': cluster.labelSize,
    },
    paint: { 'text-color': cluster.label },
  });
  map.addLayer({
    id: MAP_LAYERS.points, type: 'circle', source: MAP_SOURCE_ID, filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': point.radius, 'circle-stroke-width': stroke.width, 'circle-stroke-color': stroke.color, 'circle-color': point.color },
  });
}

/**
 * Draws the layers again with the tokens of the theme now applied. Needed when both themes share one basemap
 * style, so no style reload re-adds them; before the style has loaded there is nothing to redraw yet.
 */
export function repaintDetectionLayers(map: MapLibreMap, result: MapResult | null, locale: Locale): void {
  if (!map.getSource(MAP_SOURCE_ID)) return;
  for (const id of [MAP_LAYERS.points, MAP_LAYERS.clusterCount, MAP_LAYERS.clusters]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  map.removeSource(MAP_SOURCE_ID);
  addDetectionLayers(map, result, locale);
}
