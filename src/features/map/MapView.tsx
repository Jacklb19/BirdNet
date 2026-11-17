import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AttributionControl, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl,
  type GeoJSONSource, type IControl, type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { routeHash } from '../../app/routes';
import { config } from '../../config/env';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatDate, formatDistance, formatMeters, formatNumber, formatPercent, useI18n, type Locale, type Messages } from '../../i18n';
import { useTheme } from '../../theme';
import type { ApproximateLocation } from '../offline/types';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { toFeatureCollection, type MapResult } from './mapData';
import { groupEncounters, type MapEncounter } from './mapEncounters';
import { photoMarkers, type PhotoMarkers } from './mapMarkers';
import { addDetectionLayers, repaintDetectionLayers } from './mapLayers';
import { popupContent } from './mapPopup';
import { popupPlacement, type CoveredEdges } from './mapViewport';
import { addWalkLayers, NO_WALK_OVERLAY, repaintWalkLayers, setWalkOverlay, type WalkOverlay } from './mapWalkLayers';
import {
  MAP_CONFIDENCE_FRACTION_DIGITS, MAP_CONTROLS, MAP_INTERACTIVE_LAYERS, MAP_LAYERS, MAP_POINTER_CLASS, MAP_POPUP,
  MAP_SOURCE_ID, MAP_STYLE_URLS, MAP_SPECIES_RECENT_LIMIT, MAP_OWN_FIT,
} from './map.config';
import './MapView.css';

// The bundled module cannot resolve MapLibre's worker next to itself; serve it as a same-origin asset.
setWorkerUrl(workerUrl);

type SpeciesNames = ReturnType<typeof useSpeciesNames>;

interface PopupText { readonly dict: Messages; readonly locale: Locale; readonly names: SpeciesNames }

/** MapLibre's own interface strings (map region label, controls, popup close button) in the active language. */
function mapLibreLocale(dict: Messages): Record<string, string> {
  const controls = dict.map.controls;
  return {
    'Map.Title': dict.map.mapLabel,
    'NavigationControl.ZoomIn': controls.zoomIn,
    'NavigationControl.ZoomOut': controls.zoomOut,
    'Popup.Close': controls.closePopup,
    'AttributionControl.ToggleAttribution': controls.toggleAttribution,
    'AttributionControl.MapFeedback': controls.mapFeedback,
  };
}

/** Lets React render a control (the locate button) inside MapLibre's own control corner, stacked with the zoom buttons. */
class SlotControl implements IControl {
  constructor(private readonly slot: HTMLElement) {}
  onAdd(): HTMLElement { return this.slot; }
  onRemove(): void { this.slot.remove(); }
}

function encounterContent(row: MapEncounter, text: PopupText): HTMLElement {
  const { dict, locale, names } = text;
  const name = commonName(names, row.species, locale);
  const t = dict.map.encounters;
  const recent = [...row.members].reverse().slice(0, MAP_SPECIES_RECENT_LIMIT);
  const count = formatCount(dict.map.sheet.songs, row.detectionCount, locale);
  const date = formatDate(new Date(row.recorded_at), locale);
  return popupContent({
    name,
    scientificName: name === row.species ? null : row.species,
    detail: row.kind === 'encounter' ? t.detail(count) : t.summaryDetail(count),
    recordedAt: Date.parse(row.recorded_at) === Date.parse(row.lastRecordedAt) ? date : t.range(date, formatDate(new Date(row.lastRecordedAt), locale)),
    recordedAtIso: row.recorded_at,
    own: row.own ? (row.site_name ? dict.map.popup.ownAt(row.site_name) : dict.map.popup.own) : null,
    note: row.generalized_m === null
      ? dict.map.popup.approximate(formatMeters(APPROX_CELL_METERS, locale))
      : dict.map.popup.threatened(formatDistance(row.generalized_m, locale)),
    records: recent.map((record) => ({
      text: record.summary_count !== undefined ? t.archived(formatCount(dict.map.sheet.songs, record.summary_count, locale)) :
        `${formatDate(new Date(record.recorded_at), locale)} · ${dict.map.popup.detail(dict.common.status[record.status], formatPercent(record.confidence, locale, MAP_CONFIDENCE_FRACTION_DIGITS))}`,
      href: record.own && record.summary_count === undefined ? routeHash({ name: 'detection', id: record.id }) : null,
    })),
    more: row.members.length > recent.length ? {
      text: dict.map.species.showing(formatNumber(recent.length, locale), formatNumber(row.members.length, locale)),
      href: row.own ? routeHash({ name: 'log' }) : null,
    } : null,
    card: { href: routeHash({ name: 'species', species: row.species }), label: dict.map.popup.card },
  });
}

function rowOf(event: MapLayerMouseEvent, result: { readonly detections: readonly MapEncounter[] } | null): MapEncounter | undefined {
  const id: unknown = event.features?.[0]?.properties.id;
  return result?.detections.find((item) => item.id === id);
}

export interface MapViewProps {
  readonly result: MapResult | null;
  /** Receives the map as soon as it is created, and null when it is removed. */
  readonly onReady: (map: MapLibreMap | null) => void;
  /** Camera offset that centres a zoomed cluster in the part of the map the panel leaves visible. */
  readonly focusOffset: () => [number, number];
  readonly covered: () => CoveredEdges;
  readonly onInspect: () => void;
  /** Floating content over the map (filters, messages). */
  readonly overlay?: ReactNode;
  /** Extra control rendered in the corner of the zoom buttons. */
  readonly control?: ReactNode;
  /** Paths and territories of the person's own map, drawn under the songs. */
  readonly walk?: WalkOverlay;
  /** Cell the person is in during a walk; null hides the marker. */
  readonly position?: ApproximateLocation | null;
}

/** MapLibre canvas with clustered encounters and area summaries; colors and sizes follow the active theme's tokens. */
export function MapView({ result: rawResult, onReady, focusOffset, covered, onInspect, overlay, control, walk = NO_WALK_OVERLAY, position = null }: MapViewProps): React.JSX.Element {
  const result = useMemo(() => rawResult ? { ...rawResult, detections: groupEncounters(rawResult.detections) } : null, [rawResult]);
  const { dict, locale } = useI18n();
  const names = useSpeciesNames();
  const { resolved } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<PhotoMarkers | null>(null);
  const popupRef = useRef<{ readonly id: string; readonly popup: Popup } | null>(null);
  const resultRef = useRef(result);
  const walkRef = useRef(walk);
  const youRef = useRef<Marker | null>(null);
  const textRef = useRef<PopupText>({ dict, locale, names });
  // Map handlers are bound once per map; refs give them the latest values without recreating the map.
  const focusRef = useRef(focusOffset);
  const coveredRef = useRef(covered);
  const inspectRef = useRef(onInspect);
  const themeRef = useRef(resolved);
  const styleRef = useRef(MAP_STYLE_URLS[resolved]);
  // MapLibre reads its strings once; the map is created again whenever this screen opens, so a language change applies.
  const localeRef = useRef(mapLibreLocale(dict));
  const [slot] = useState(() => {
    const element = document.createElement('div');
    // Not a .maplibregl-ctrl: MapLibre's button rules would override the token colors of the button inside.
    element.className = 'bn-map-view__slot';
    return element;
  });

  useEffect(() => {
    textRef.current = { dict, locale, names };
    const active = popupRef.current;
    const row = active && resultRef.current?.detections.find((item) => item.id === active.id);
    if (active && row) active.popup.setDOMContent(encounterContent(row, textRef.current));
  }, [dict, locale, names]);
  useEffect(() => { focusRef.current = focusOffset; }, [focusOffset]);
  useEffect(() => { coveredRef.current = covered; }, [covered]);
  useEffect(() => { inspectRef.current = onInspect; }, [onInspect]);

  useEffect(() => {
    resultRef.current = result;
    void mapRef.current?.getSource<GeoJSONSource>(MAP_SOURCE_ID)?.setData(toFeatureCollection(result?.detections ?? []));
    const active = popupRef.current;
    const row = active && result?.detections.find((item) => item.id === active.id);
    if (active && row) active.popup.setLngLat([row.longitude, row.latitude]).setDOMContent(encounterContent(row, textRef.current));
    else active?.popup.remove();
    // New data re-renders the dots on the next frame; the stickers follow once the map is idle again.
    if (!result) markersRef.current?.clear();
  }, [result]);

  useEffect(() => {
    walkRef.current = walk;
    if (mapRef.current) setWalkOverlay(mapRef.current, walk);
  }, [walk]);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current, style: styleRef.current, locale: localeRef.current,
      center: [...config.map.initialCenter], zoom: config.map.initialZoom,
      // North stays up: the visible area is then a plain rectangle and no compass is needed.
      dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0,
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    mapRef.current = map;
    const open = (row: MapEncounter): void => {
      inspectRef.current();
      popupRef.current?.popup.remove();
      const placement = popupPlacement(map.getContainer().clientWidth, map.getContainer().clientHeight, coveredRef.current(), MAP_OWN_FIT.paddingPx);
      const popup = new Popup({ ...MAP_POPUP, anchor: 'bottom' }).setLngLat([row.longitude, row.latitude]).setDOMContent(encounterContent(row, textRef.current)).addTo(map);
      popup.getElement().style.setProperty('--map-popup-available-height', `${String(placement.maxHeight)}px`);
      map.easeTo({ center: [row.longitude, row.latitude], offset: placement.offset });
      popupRef.current = { id: row.id, popup };
      popup.on('close', () => { if (popupRef.current?.popup === popup) popupRef.current = null; });
    };
    map.addControl(new AttributionControl({ compact: true }), MAP_CONTROLS.attribution);
    // Bottom corners stack upwards in reverse order: the zoom buttons end up above the locate button.
    map.addControl(new SlotControl(slot), MAP_CONTROLS.navigation);
    map.addControl(new NavigationControl({ showCompass: false }), MAP_CONTROLS.navigation);
    map.on('style.load', () => {
      addWalkLayers(map, walkRef.current);
      addDetectionLayers(map, resultRef.current, textRef.current.locale);
    });
    map.on('click', MAP_LAYERS.clusters, (event: MapLayerMouseEvent) => {
      const clusterId: unknown = event.features?.[0]?.properties.cluster_id;
      if (typeof clusterId !== 'number') return;
      const center = event.lngLat;
      void map.getSource<GeoJSONSource>(MAP_SOURCE_ID)?.getClusterExpansionZoom(clusterId).then((zoom) => { map.easeTo({ center, zoom, offset: focusRef.current() }); });
    });
    map.on('click', MAP_LAYERS.points, (event: MapLayerMouseEvent) => {
      const row = rowOf(event, resultRef.current);
      if (row) open(row);
    });
    const markers = photoMarkers(map, {
      rows: () => resultRef.current?.detections ?? [],
      onOpen: open,
      label: (row) => {
        const { dict: text, locale: language, names: table } = textRef.current;
        return text.map.popup.marker(commonName(table, row.species, language),
          `${row.kind === 'encounter' ? text.map.encounters.single : text.map.encounters.summary} · ${formatCount(text.map.sheet.songs, row.detectionCount, language)} · ${formatDate(new Date(row.recorded_at), language)}`);
      },
    });
    markersRef.current = markers;
    // 'idle' fires after every pan, zoom, data or style change has been drawn, which is when the visible dots are known.
    map.on('idle', markers.sync);
    for (const layer of MAP_INTERACTIVE_LAYERS) {
      map.on('mouseenter', layer, () => { map.getCanvas().classList.add(MAP_POINTER_CLASS); });
      map.on('mouseleave', layer, () => { map.getCanvas().classList.remove(MAP_POINTER_CLASS); });
    }
    // The visible area is known as soon as the map exists, so detections load while the basemap is still on its
    // way (or if it never arrives); the layers pick up the latest result when the style loads.
    onReady(map);
    return () => { markers.clear(); markersRef.current = null; popupRef.current = null; youRef.current = null; mapRef.current = null; onReady(null); map.remove(); };
  }, [slot, onReady]);

  // The "you are here" marker of a walk: a DOM element, so it can pulse and follows the theme's tokens.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) {
      youRef.current?.remove();
      youRef.current = null;
      return;
    }
    if (!youRef.current) {
      const element = document.createElement('span');
      element.className = 'bn-map-you';
      element.setAttribute('aria-hidden', 'true');
      youRef.current = new Marker({ element }).setLngLat([position.longitude, position.latitude]).addTo(map);
    } else {
      youRef.current.setLngLat([position.longitude, position.latitude]);
    }
  }, [position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === resolved) return;
    themeRef.current = resolved;
    const style = MAP_STYLE_URLS[resolved];
    if (styleRef.current !== style) {
      styleRef.current = style;
      // A full reload (no diff) drops the custom layers and fires style.load, which adds them back with the new colors.
      map.setStyle(style, { diff: false });
      return;
    }
    // Both themes share one basemap: only the detection layers change. The theme provider applies the new tokens in
    // its own effect, which runs after this one, so they are read on the next frame.
    const frame = window.requestAnimationFrame(() => {
      repaintDetectionLayers(map, resultRef.current, textRef.current.locale);
      repaintWalkLayers(map, walkRef.current);
    });
    return () => { window.cancelAnimationFrame(frame); };
  }, [resolved]);

  return (
    <div className="bn-map-view">
      {/* Before the canvas in the document, so keyboard focus meets the filters first, as the eye does. */}
      {overlay}
      <div ref={container} className="bn-map-view__canvas" />
      {createPortal(control, slot)}
    </div>
  );
}
