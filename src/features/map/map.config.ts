/**
 * Settings of the collective map. Deployment values (style URLs, initial view) come from `config.map`, and
 * sizes and colors come from the design tokens in `src/styles/tokens.css`; this module only adds the MapLibre
 * wiring and behaviour tuning that belong to no deployment.
 */
import { config } from '../../config/env';
import type { DetectionStatus } from '../../config/contract';
import type { ResolvedTheme } from '../../theme';

/** Basemap style for each resolved theme; switching themes swaps the whole style. */
export const MAP_STYLE_URLS: Readonly<Record<ResolvedTheme, string>> = Object.freeze({
  light: config.map.styleLightUrl,
  dark: config.map.styleDarkUrl,
});

/** GeoJSON source holding the detections of the visible area. */
export const MAP_SOURCE_ID = 'detections';

/** Layer ids, referenced by the layer setup and by the click and hover handlers. */
export const MAP_LAYERS = Object.freeze({
  clusters: 'clusters',
  clusterCount: 'cluster-count',
  points: 'points',
} as const);

/** Layers that react to the pointer: a cluster zooms in, a point opens its details. */
export const MAP_INTERACTIVE_LAYERS = Object.freeze([MAP_LAYERS.clusters, MAP_LAYERS.points] as const);

/** Cursor over the interactive layers. MapLibre draws every marker on one canvas, so CSS cannot target them. */
export const MAP_INTERACTIVE_CURSOR = 'pointer';

/** Canvas context MapLibre GL needs (version 5 on renders only with WebGL 2); without it a notice replaces the map. */
export const MAP_WEBGL_CONTEXT = 'webgl2';

export const MAP_CLUSTER = Object.freeze({
  /** Screen distance, in pixels, within which detections merge into one cluster. */
  radiusPx: 48,
  /** From the next zoom level on every detection is drawn on its own. */
  maxZoom: 14,
  /** Point counts from which a cluster grows to the medium and to the large radius token. */
  sizeBreakpoints: Object.freeze({ medium: 10, large: 50 }),
});

/** Zoom buttons only: the map is never rotated, so a compass would be a control without a purpose. */
export const MAP_NAVIGATION = Object.freeze({ position: 'top-right', showCompass: false } as const);

/** Quiet time after the last pan or zoom before querying, so one drag sends one request. */
export const MAP_RELOAD_DEBOUNCE_MS = 400;

/** Rows in the accessible text list; the map itself draws every detection the API returned. */
export const MAP_LIST_PAGE_SIZE = 50;

/**
 * Font stack of the cluster counts. MapLibre draws text with the glyphs served by the active style, not with
 * the page fonts, so this must name a font that both configured styles provide (the OpenFreeMap styles ship
 * Noto Sans). Check it whenever VITE_MAP_STYLE_LIGHT_URL or VITE_MAP_STYLE_DARK_URL changes: a font the style
 * lacks hides the labels.
 */
export const MAP_LABEL_FONT: readonly string[] = Object.freeze(['Noto Sans Bold']);

/** Marker color of each verification state; spelled out so a search for a token finds its use. */
export const STATUS_COLOR_TOKEN = Object.freeze({
  confirmed: '--color-status-confirmed',
  provisional: '--color-status-provisional',
  verified: '--color-status-verified',
  corrected: '--color-status-corrected',
} as const satisfies Record<DetectionStatus, string>);

/** Design tokens of the map layers; the size tokens are declared in px because MapLibre paints in CSS pixels. */
export const MAP_TOKENS = Object.freeze({
  clusterFill: '--color-brand',
  clusterLabel: '--color-on-brand',
  markerStroke: '--color-bg-surface',
  clusterRadiusSmall: '--map-cluster-radius-s',
  clusterRadiusMedium: '--map-cluster-radius-m',
  clusterRadiusLarge: '--map-cluster-radius-l',
  pointRadius: '--map-point-radius',
  markerStrokeWidth: '--map-marker-stroke-width',
  labelSize: '--map-label-size',
} as const);
