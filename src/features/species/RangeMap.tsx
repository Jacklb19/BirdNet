import { useEffect, useRef, useState } from 'react';
import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { formatCount, useI18n, type Messages } from '../../i18n';
import { useTheme } from '../../theme';
import { MAP_STYLE_URLS, MAP_WEBGL_CONTEXT } from '../map/map.config';
import { useOnline } from '../offline/useQueueStatus';
import {
  fetchRangeExtent, GBIF_SITE_URL, gbifSpeciesUrl, RANGE_TILE_SIZE, rangeTileUrl, type RangeBounds, type RangeExtent, type TaxonState,
} from './gbif';
import './RangeMap.css';

const RANGE_SOURCE_ID = 'species-range';
const RANGE_LAYER_ID = 'species-range';
/** Component token of RangeMap.css: how much of the basemap shows through the hexagons. */
const RANGE_OPACITY_TOKEN = '--range-map-layer-opacity';
/** Credit of the records inside the map's own credits, next to the basemap's. */
const RANGE_ATTRIBUTION = `<a href="${GBIF_SITE_URL}" target="_blank" rel="noopener noreferrer">GBIF.org</a>`;

/** MapLibre's classes of the credits control and of its collapsed form. */
const CREDITS_CLASS = 'maplibregl-ctrl-attrib';
const CREDITS_COMPACT_CLASS = 'maplibregl-compact';

/** The inhabited world, shown when GBIF gives no box of the records: the poles would only add empty map. */
const WORLD_BOUNDS: RangeBounds = [-168, -56, 178, 74];
/** Web Mercator has no poles: a box that reaches them is cut here before it is framed. */
const MAX_FRAMED_LATITUDE = 80;
const RANGE_VIEW = Object.freeze({
  /** Below zoom 0 the whole world still fits a phone-wide map. */
  minZoom: -1,
  /** Regional scale: a hexagon is a count of records, not a place to walk to. */
  maxZoom: 8,
  /** A species recorded in one valley is framed with its country around it, not as one huge hexagon. */
  maxInitialZoom: 5,
  /** Room, in pixels, between the outermost records and the edge of the map. */
  paddingPx: 28,
});

/** Probed once per page load: each probe creates a WebGL context, and browsers cap how many may exist at a time. */
let webGLSupport: boolean | undefined;

function supportsWebGL(): boolean {
  if (webGLSupport !== undefined) return webGLSupport;
  try {
    const context = document.createElement('canvas').getContext(MAP_WEBGL_CONTEXT);
    webGLSupport = context !== null;
    // Released at once rather than whenever the canvas is collected, so it never competes with the map's own.
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webGLSupport = false;
  }
  return webGLSupport;
}

/** MapLibre is large: it is fetched when a card first draws its map, not with the page. */
async function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  const [maplibre] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]);
  // The bundled module cannot resolve MapLibre's worker next to itself; serve it as a same-origin asset.
  maplibre.setWorkerUrl(workerUrl);
  return maplibre;
}

/** MapLibre's own interface strings in the active language; the canvas is named after the species. */
function mapLibreLocale(dict: Messages, label: string): Record<string, string> {
  const controls = dict.map.controls;
  const gestures = dict.species.card.range.gestures;
  return {
    'Map.Title': label,
    'NavigationControl.ZoomIn': controls.zoomIn,
    'NavigationControl.ZoomOut': controls.zoomOut,
    'AttributionControl.ToggleAttribution': controls.toggleAttribution,
    'AttributionControl.MapFeedback': controls.mapFeedback,
    'CooperativeGesturesHandler.WindowsHelpText': gestures.keyboard('Ctrl'),
    'CooperativeGesturesHandler.MacHelpText': gestures.keyboard('⌘'),
    'CooperativeGesturesHandler.MobileHelpText': gestures.touch,
  };
}

function framed(extent: RangeExtent | null): LngLatBoundsLike {
  const [west, south, east, north] = extent?.bounds ?? WORLD_BOUNDS;
  return [[west, Math.max(south, -MAX_FRAMED_LATITUDE)], [east, Math.min(north, MAX_FRAMED_LATITUDE)]];
}

/** The density tiles go under the basemap's labels, so country and city names stay readable over the hexagons. */
function addRangeLayer(map: MapLibreMap, taxonKey: number): void {
  if (map.getSource(RANGE_SOURCE_ID)) return;
  const opacity = Number.parseFloat(getComputedStyle(map.getContainer()).getPropertyValue(RANGE_OPACITY_TOKEN));
  const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  map.addSource(RANGE_SOURCE_ID, {
    type: 'raster', tiles: [rangeTileUrl(taxonKey, window.devicePixelRatio > 1 ? 2 : 1)], tileSize: RANGE_TILE_SIZE, attribution: RANGE_ATTRIBUTION,
  });
  map.addLayer({
    id: RANGE_LAYER_ID, type: 'raster', source: RANGE_SOURCE_ID,
    // Without the stylesheet's token the hexagons are simply opaque.
    paint: Number.isFinite(opacity) ? { 'raster-opacity': opacity } : {},
  }, firstLabel);
}

type View =
  | { readonly status: 'loading' | 'empty' | 'failed' }
  /** `records` is null when GBIF did not tell how many it holds. */
  | { readonly status: 'ready'; readonly records: number | null };

/** The map itself, mounted once per species while there is a network and WebGL to draw it. */
function RangeFigure({ taxonKey, name }: { readonly taxonKey: number; readonly name: string }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.card.range;
  const { resolved } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleRef = useRef(MAP_STYLE_URLS[resolved]);
  const label = texts.mapLabel(name);
  // The common name arrives after the first render; the canvas is renamed instead of drawing the map again.
  const labelRef = useRef(label);
  const [view, setView] = useState<View>({ status: 'loading' });

  useEffect(() => {
    labelRef.current = label;
    mapRef.current?.getCanvas().setAttribute('aria-label', label);
  }, [label]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let active = true;
    let map: MapLibreMap | null = null;
    let styled = false;
    const discard = (): void => { mapRef.current = null; map?.remove(); map = null; };
    Promise.all([loadMapLibre(), fetchRangeExtent(taxonKey)]).then(([maplibre, extent]) => {
      if (!active) return;
      if (extent?.records === 0) { setView({ status: 'empty' }); return; }
      const created = new maplibre.Map({
        container: element, style: styleRef.current, locale: mapLibreLocale(dict, labelRef.current),
        bounds: framed(extent), fitBoundsOptions: { padding: RANGE_VIEW.paddingPx, maxZoom: RANGE_VIEW.maxInitialZoom },
        minZoom: RANGE_VIEW.minZoom, maxZoom: RANGE_VIEW.maxZoom,
        // North stays up, as in the shared map.
        dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
        // The map sits inside a scrolling page: one finger and the plain wheel keep scrolling the card.
        cooperativeGestures: true,
        attributionControl: false,
      });
      map = created;
      mapRef.current = created;
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      created.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');
      // MapLibre opens compact credits until the first drag, and on a map this small they cover part of the range.
      // Marked compact before the credits arrive, they start behind their button; GBIF is also credited in the caption.
      element.querySelector(`.${CREDITS_CLASS}`)?.classList.add(CREDITS_COMPACT_CLASS);
      created.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right');
      // Fires again after a theme switch reloads the style, which drops the layer.
      created.on('style.load', () => {
        styled = true;
        addRangeLayer(created, taxonKey);
        setView({ status: 'ready', records: extent?.records ?? null });
      });
      created.on('error', (event) => {
        // A basemap that never arrives or range tiles that fail leave a map that would read as "no records": no map is more honest.
        const rangeFailed = 'sourceId' in event && event.sourceId === RANGE_SOURCE_ID;
        if (!rangeFailed && styled) return;
        discard();
        setView({ status: 'failed' });
      });
    }).catch(() => { if (active) setView({ status: 'failed' }); });
    return () => { active = false; discard(); };
  }, [taxonKey, dict]);

  useEffect(() => {
    const style = MAP_STYLE_URLS[resolved];
    if (styleRef.current === style) return;
    styleRef.current = style;
    // A full reload (no diff) drops the range layer and fires style.load, which adds it back.
    mapRef.current?.setStyle(style, { diff: false });
  }, [resolved]);

  // One honest line instead of an empty frame; the map was never created or is already removed.
  if (view.status === 'empty') return <p className="bn-range-map__note">{texts.empty}</p>;
  if (view.status === 'failed') return <p className="bn-range-map__note">{texts.unavailable}</p>;
  return (
    <figure className="bn-range-map">
      <div className="bn-range-map__frame">
        <div ref={container} className="bn-range-map__canvas" />
        {view.status === 'loading' && <p className="bn-range-map__loading" role="status">{dict.common.loading}</p>}
      </div>
      <figcaption className="bn-range-map__caption">
        <p>{texts.caption} {texts.legend}</p>
        <p>
          {view.status === 'ready' && view.records !== null && <>{formatCount(texts.records, view.records, locale)}{dict.common.separator}</>}
          <a href={gbifSpeciesUrl(taxonKey)} target="_blank" rel="noopener noreferrer">{texts.source}</a>
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Where the species lives: GBIF's density of records over the app's basemap, framed on the box that holds them. It
 * is general knowledge about the species, not the person's own records, and its caption says what the hexagons are.
 */
export function RangeMap({ taxon, name }: { readonly taxon: TaxonState; readonly name: string }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.species.card.range;
  const online = useOnline();
  const [webgl] = useState(supportsWebGL);
  if (taxon.status === 'loading') return <p className="bn-range-map__note" role="status">{dict.common.loading}</p>;
  if (taxon.status === 'none') return <p className="bn-range-map__note">{texts.none}</p>;
  // The tiles are never kept offline, so a classification read from the cache still has no map.
  if (taxon.status !== 'loaded' || !online) return <p className="bn-range-map__note">{texts.offline}</p>;
  if (!webgl) return <p className="bn-range-map__note">{texts.unsupported}</p>;
  return <RangeFigure key={taxon.taxon.key} taxonKey={taxon.taxon.key} name={name} />;
}
