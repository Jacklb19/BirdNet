import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { fetchSpeciesPhoto } from '../species/speciesPhotos';
import { MAP_LAYERS, MAP_PHOTO_MARKERS_MAX } from './map.config';
import type { MapDetection } from './mapData';

/**
 * Photo markers (RF-12, S7): every detection drawn on its own (not in a cluster) gets a small die-cut sticker
 * with its species' photo on top of its colored dot. MapLibre draws the dots on the canvas; the stickers are DOM
 * markers kept in step with the dots that are actually visible, so their number stays bounded.
 */
export interface PhotoMarkers {
  /** Reconciles the stickers with the unclustered points currently rendered. */
  readonly sync: () => void;
  readonly clear: () => void;
}

export interface PhotoMarkerOptions {
  /** Accessible name of a sticker (species and time), in the active language. */
  readonly label: (row: MapDetection) => string;
  readonly onOpen: (row: MapDetection) => void;
  /** Latest rows, read on every sync. */
  readonly rows: () => readonly MapDetection[];
}

function stickerElement(row: MapDetection, options: PhotoMarkerOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bn-map-photo';
  button.setAttribute('aria-label', options.label(row));
  button.addEventListener('click', (event) => { event.stopPropagation(); options.onOpen(row); });
  // Offline or without a photo the sticker keeps its plain face; the dot underneath still marks the place.
  void fetchSpeciesPhoto(row.species).then((photo) => {
    if (!photo) return;
    const image = document.createElement('img');
    image.className = 'bn-map-photo__image';
    image.alt = '';
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = photo.url;
    button.append(image);
  }).catch(() => undefined);
  return button;
}

export function photoMarkers(map: MapLibreMap, options: PhotoMarkerOptions): PhotoMarkers {
  const markers = new Map<string, Marker>();
  const clear = (): void => {
    for (const marker of markers.values()) marker.remove();
    markers.clear();
  };
  const sync = (): void => {
    if (!map.getLayer(MAP_LAYERS.points)) { clear(); return; }
    const rows = new Map(options.rows().map((row) => [row.id, row]));
    const visible = new Set<string>();
    for (const feature of map.queryRenderedFeatures({ layers: [MAP_LAYERS.points] })) {
      const id: unknown = feature.properties.id;
      if (typeof id !== 'string' || visible.size >= MAP_PHOTO_MARKERS_MAX) continue;
      const row = rows.get(id);
      if (!row) continue;
      visible.add(id);
      if (!markers.has(id)) {
        markers.set(id, new Marker({ element: stickerElement(row, options) }).setLngLat([row.longitude, row.latitude]).addTo(map));
      }
    }
    for (const [id, marker] of markers) {
      if (!visible.has(id)) { marker.remove(); markers.delete(id); }
    }
  };
  return { sync, clear };
}
