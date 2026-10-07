import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { formatDate, formatNumber, formatPercent, useI18n } from '../../i18n';
import { useTheme } from '../../theme';
import { FieldIcon } from '../../shared/FieldIcon';
import { fetchMapDetections, periodStart, speciesOptions, toFeatureCollection, type MapPeriod, type MapResult } from './mapData';

// The bundled module cannot resolve MapLibre's worker next to itself; serve it as a same-origin asset.
setWorkerUrl(workerUrl);

const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' } as const;
const INITIAL_CENTER: [number, number] = [-74.08, 4.65];
const RELOAD_DELAY_MS = 400;
const LIST_LIMIT = 50;
const EMPTY: MapResult = { detections: [], truncated: false };

function supportsWebGL(): boolean {
  try { return document.createElement('canvas').getContext('webgl2') !== null; } catch { return false; }
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Layers are re-added on every style load so a theme switch keeps clusters and colors in sync. */
function addDetectionLayers(map: MapLibreMap, result: MapResult): void {
  if (map.getSource('detections')) return;
  map.addSource('detections', { type: 'geojson', data: toFeatureCollection(result.detections), cluster: true, clusterRadius: 48, clusterMaxZoom: 14 });
  map.addLayer({
    id: 'clusters', type: 'circle', source: 'detections', filter: ['has', 'point_count'],
    paint: {
      'circle-color': token('--color-primary'), 'circle-stroke-color': token('--color-surface'), 'circle-stroke-width': 2,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 21, 50, 27],
    },
  });
  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'detections', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13 },
    paint: { 'text-color': token('--color-primary-text') },
  });
  map.addLayer({
    id: 'points', type: 'circle', source: 'detections', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': token('--color-surface'),
      'circle-color': ['match', ['get', 'status'],
        'confirmed', token('--color-success-border'), 'verified', token('--color-focus'), 'corrected', token('--color-text-primary'),
        token('--color-warning')],
    },
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
  const styleRef = useRef(STYLES[resolved]);
  const [ready, setReady] = useState(false);
  const [species, setSpecies] = useState<string | null>(null);
  const [period, setPeriod] = useState<MapPeriod>('30');
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
      void map.getSource<GeoJSONSource>('detections')?.setData(toFeatureCollection(next.detections));
      setState('idle');
    } catch {
      // Aborted requests were superseded by a newer view; only real failures reach the interface.
      if (!signal.aborted) setState('error');
    }
  }, [accessToken, species, period]);

  useEffect(() => {
    if (!container.current || !supportsWebGL()) return;
    const map = new MapLibreMap({ container: container.current, style: styleRef.current, center: INITIAL_CENTER, zoom: 10 });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('style.load', () => { addDetectionLayers(map, resultRef.current); });
    map.once('load', () => { setReady(true); });
    map.on('click', 'clusters', (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId: unknown = feature?.properties.cluster_id;
      if (typeof clusterId !== 'number') return;
      const center = event.lngLat;
      void map.getSource<GeoJSONSource>('detections')?.getClusterExpansionZoom(clusterId).then((zoom) => { map.easeTo({ center, zoom }); });
    });
    map.on('click', 'points', (event: MapLayerMouseEvent) => {
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
    for (const layer of ['clusters', 'points']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    }
    return () => { mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === STYLES[resolved]) return;
    styleRef.current = STYLES[resolved];
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
      timer = setTimeout(() => { void load(signal); }, RELOAD_DELAY_MS);
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
          <select value={period} onChange={(event) => { setPeriod(event.target.value as MapPeriod); }}>
            <option value="7">{m.period7}</option><option value="30">{m.period30}</option>
            <option value="365">{m.period365}</option><option value="all">{m.periodAll}</option>
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
          <ol>{result.detections.slice(0, LIST_LIMIT).map((row) => (
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
