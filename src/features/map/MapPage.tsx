import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { config } from '../../config/env';
import { DEFAULT_PERIOD, DETECTION_STATUSES, PERIODS, isPeriod, type Period } from '../../config/contract';
import { formatDate, formatNumber, formatPercent, useI18n, type TranslationSchema } from '../../i18n';
import { useTheme } from '../../theme';
import { FieldIcon } from '../../shared/FieldIcon';
import { fetchMapDetections, periodStart, speciesOptions, toFeatureCollection, type MapResult } from './mapData';
import {
  MAP_CLUSTER, MAP_INTERACTIVE_CURSOR, MAP_INTERACTIVE_LAYERS, MAP_LABEL_FONT, MAP_LAYERS, MAP_LIST_PAGE_SIZE, MAP_NAVIGATION,
  MAP_RELOAD_DEBOUNCE_MS, MAP_SOURCE_ID, MAP_STYLE_URLS, MAP_TOKENS, MAP_WEBGL_CONTEXT, STATUS_COLOR_TOKEN,
} from './map.config';

// The bundled module cannot resolve MapLibre's worker next to itself; serve it as a same-origin asset.
setWorkerUrl(workerUrl);

const EMPTY: MapResult = { detections: [], truncated: false };

/** Dictionary key of each period label; the map dictionary is restructured in the next phase. */
const PERIOD_LABEL_KEY = {
  week: 'period7', month: 'period30', year: 'period365', all: 'periodAll',
} as const satisfies Record<Period, keyof TranslationSchema['map']>;

function supportsWebGL(): boolean {
  try { return document.createElement('canvas').getContext(MAP_WEBGL_CONTEXT) !== null; } catch { return false; }
}

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
function addDetectionLayers(map: MapLibreMap, result: MapResult): void {
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
    type: 'geojson', data: toFeatureCollection(result.detections), cluster: true,
    clusterRadius: MAP_CLUSTER.radiusPx, clusterMaxZoom: MAP_CLUSTER.maxZoom,
  });
  map.addLayer({
    id: MAP_LAYERS.clusters, type: 'circle', source: MAP_SOURCE_ID, filter: ['has', 'point_count'],
    paint: { 'circle-color': cluster.fill, 'circle-stroke-color': stroke.color, 'circle-stroke-width': stroke.width, 'circle-radius': clusterRadius },
  });
  map.addLayer({
    id: MAP_LAYERS.clusterCount, type: 'symbol', source: MAP_SOURCE_ID, filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': [...MAP_LABEL_FONT], 'text-size': cluster.labelSize },
    paint: { 'text-color': cluster.label },
  });
  map.addLayer({
    id: MAP_LAYERS.points, type: 'circle', source: MAP_SOURCE_ID, filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': point.radius, 'circle-stroke-width': stroke.width, 'circle-stroke-color': stroke.color, 'circle-color': point.color },
  });
}

interface MapPageProps { readonly accessToken: string | null }

/** Collective map: MapLibre clusters the visible area; a text list mirrors it for screen readers. */
export function MapPage({ accessToken }: MapPageProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const m = dict.map;
  const { resolved } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const resultRef = useRef<MapResult>(EMPTY);
  const textRef = useRef({ dict, locale });
  const styleRef = useRef(MAP_STYLE_URLS[resolved]);
  const [ready, setReady] = useState(false);
  const [species, setSpecies] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [options, setOptions] = useState<string[]>([]);
  const [result, setResult] = useState<MapResult>(EMPTY);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'unsupported'>(() => supportsWebGL() ? 'idle' : 'unsupported');
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => { textRef.current = { dict, locale }; }, [dict, locale]);

  const load = useCallback(async (signal: AbortSignal): Promise<void> => {
    const map = mapRef.current;
    if (!map || !accessToken || !navigator.onLine) return;
    const bounds = map.getBounds();
    setState('loading');
    try {
      const next = await fetchMapDetections(
        { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() },
        { species, since: periodStart(period, new Date()) }, accessToken, signal,
      );
      resultRef.current = next;
      setResult(next);
      if (!species) setOptions(speciesOptions(next.detections));
      void map.getSource<GeoJSONSource>(MAP_SOURCE_ID)?.setData(toFeatureCollection(next.detections));
      setState('idle');
    } catch {
      // Aborted requests were superseded by a newer view; only real failures reach the interface.
      if (!signal.aborted) setState('error');
    }
  }, [accessToken, species, period]);

  useEffect(() => {
    if (!container.current || !supportsWebGL()) return;
    const map = new MapLibreMap({
      container: container.current, style: styleRef.current,
      center: [...config.map.initialCenter], zoom: config.map.initialZoom,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: MAP_NAVIGATION.showCompass }), MAP_NAVIGATION.position);
    map.on('style.load', () => { addDetectionLayers(map, resultRef.current); });
    map.once('load', () => { setReady(true); });
    map.on('click', MAP_LAYERS.clusters, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId: unknown = feature?.properties.cluster_id;
      if (typeof clusterId !== 'number') return;
      const center = event.lngLat;
      void map.getSource<GeoJSONSource>(MAP_SOURCE_ID)?.getClusterExpansionZoom(clusterId).then((zoom) => { map.easeTo({ center, zoom }); });
    });
    map.on('click', MAP_LAYERS.points, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const { dict: text, locale: current } = textRef.current;
      const row = resultRef.current.detections.find((item) => item.id === feature.properties.id);
      if (!row) return;
      // Species names come from other users: build the popup with text nodes, never HTML.
      const body = document.createElement('div');
      body.className = 'map-popup';
      const name = document.createElement('strong');
      name.textContent = row.species;
      const details = document.createElement('p');
      details.textContent = `${text.map.confidence}: ${formatPercent(row.confidence, current)} · ${text.map.status[row.status]}`;
      const when = document.createElement('p');
      when.textContent = `${text.map.recordedAt}: ${formatDate(new Date(row.recorded_at), current)}`;
      body.append(name, details, when);
      new Popup({ closeButton: true }).setLngLat([row.longitude, row.latitude]).setDOMContent(body).addTo(map);
    });
    for (const layer of MAP_INTERACTIVE_LAYERS) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = MAP_INTERACTIVE_CURSOR; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
    return () => { mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === MAP_STYLE_URLS[resolved]) return;
    styleRef.current = MAP_STYLE_URLS[resolved];
    // setStyle drops custom layers; the style.load handler restores them with the new theme colors.
    map.setStyle(styleRef.current);
  }, [resolved]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      controller.abort();
      controller = new AbortController();
      clearTimeout(timer);
      const signal = controller.signal;
      timer = setTimeout(() => { void load(signal); }, MAP_RELOAD_DEBOUNCE_MS);
    };
    schedule();
    map.on('moveend', schedule);
    return () => { map.off('moveend', schedule); clearTimeout(timer); controller.abort(); };
  }, [load, ready]);

  useEffect(() => {
    const changed = (): void => { setOnline(navigator.onLine); };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);

  const notice = !accessToken ? m.signInRequired : !online ? m.offline : state === 'unsupported' || state === 'error' ? m.error : null;
  return (
    <section aria-label={m.title} className="page map-page">
      <header className="page-heading"><p className="eyebrow">{dict.app.navMap}</p><h2>{m.title}</h2><p>{m.subtitle}</p></header>
      <div className="map-filters">
        <label>{m.species}
          <select value={species ?? ''} onChange={(event) => { setSpecies(event.target.value || null); }}>
            <option value="">{m.allSpecies}</option>
            {(species && !options.includes(species) ? [species, ...options] : options).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>{m.period}
          <select value={period} onChange={(event) => { if (isPeriod(event.target.value)) setPeriod(event.target.value); }}>
            {PERIODS.map((option) => <option key={option.value} value={option.value}>{m[PERIOD_LABEL_KEY[option.value]]}</option>)}
          </select>
        </label>
      </div>
      {notice && <p role={state === 'error' ? 'alert' : 'status'} className="account-notice"><FieldIcon name={state === 'error' ? 'error' : 'shield'} />{notice}</p>}
      <div ref={container} className="map-canvas" role="region" aria-label={m.mapAria} />
      <p className="map-summary" aria-live="polite">
        {state === 'loading' ? m.loading : m.count.replace('{count}', formatNumber(result.detections.length, locale))}
        {result.truncated && ` ${m.truncated.replace('{count}', formatNumber(result.detections.length, locale))}`}
      </p>
      <p className="indicative-notice">{m.absenceNotice}</p>
      {result.detections.length > 0 && (
        <details className="map-list">
          <summary>{m.listTitle}</summary>
          <ol>{result.detections.slice(0, MAP_LIST_PAGE_SIZE).map((row) => (
            <li key={row.id}>
              <i>{row.species}</i>
              <span>{formatPercent(row.confidence, locale)} · {m.status[row.status]}</span>
              <time dateTime={row.recorded_at}>{formatDate(new Date(row.recorded_at), locale)}</time>
            </li>
          ))}</ol>
        </details>
      )}
    </section>
  );
}

export default MapPage;
