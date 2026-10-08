import { useCallback, useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Period } from '../../config/contract';
import { fetchMapDetections, mapFailure, periodStart, speciesOptions, type MapBounds, type MapFailure, type MapResult } from './mapData';
import { visibleRect, type CoveredEdges } from './mapViewport';
import { MAP_RELOAD_DEBOUNCE_MS } from './map.config';

export type MapLoadStatus = 'idle' | 'loading' | 'error';

export interface MapQuery {
  readonly token: string | null;
  /** False while signed out or offline: nothing is requested and the last result is kept untouched. */
  readonly enabled: boolean;
  readonly species: string | null;
  readonly period: Period;
  /** Strip of the map hidden under the panel, measured when the query is sent; the list describes only what can be seen. */
  readonly covered: () => CoveredEdges;
}

export interface MapResultState {
  /** Null until the first answer for the current session arrives. */
  readonly result: MapResult | null;
  readonly status: MapLoadStatus;
  /** What went wrong while `status` is 'error'. */
  readonly failure: MapFailure | null;
  /** Species of the last unfiltered answer, so choosing one does not empty the filter. */
  readonly speciesOptions: readonly string[];
  readonly retry: () => void;
}

/** The map is never rotated, so the visible area is the rectangle between two screen corners. */
function visibleBounds(map: MapLibreMap, covered: CoveredEdges): MapBounds {
  const container = map.getContainer();
  const corner = visibleRect(container.clientWidth, container.clientHeight, covered);
  const northWest = map.unproject([0, 0]);
  const southEast = map.unproject([corner.right, corner.bottom]);
  return { west: northWest.lng, north: northWest.lat, east: southEast.lng, south: southEast.lat };
}

/** Detections of the visible area, reloaded (debounced) after every pan or zoom and whenever a filter changes. */
export function useMapResult(map: MapLibreMap | null, query: MapQuery): MapResultState {
  const { token, enabled, species, period, covered } = query;
  const [result, setResult] = useState<MapResult | null>(null);
  const [status, setStatus] = useState<MapLoadStatus>('idle');
  const [failure, setFailure] = useState<MapFailure | null>(null);
  const [options, setOptions] = useState<readonly string[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!map || !token || !enabled) return;
    let controller = new AbortController();
    let timer: number | undefined;
    const load = async (signal: AbortSignal): Promise<void> => {
      setStatus('loading');
      try {
        const next = await fetchMapDetections(visibleBounds(map, covered()), { species, since: periodStart(period, new Date()) }, token, signal);
        if (signal.aborted) return;
        setResult(next);
        if (!species) setOptions(speciesOptions(next.detections));
        setFailure(null);
        setStatus('idle');
      } catch (error) {
        // Aborted requests were superseded by a newer view; only real failures reach the interface.
        if (signal.aborted) return;
        setFailure(mapFailure(error));
        setStatus('error');
      }
    };
    const schedule = (): void => {
      controller.abort();
      controller = new AbortController();
      window.clearTimeout(timer);
      const { signal } = controller;
      timer = window.setTimeout(() => { void load(signal); }, MAP_RELOAD_DEBOUNCE_MS);
    };
    schedule();
    // MapLibre also ends a move when its container is resized. The panel floats over the map instead of
    // shrinking it, so its height changing between loading, error and results never triggers a new request.
    map.on('moveend', schedule);
    return () => { map.off('moveend', schedule); window.clearTimeout(timer); controller.abort(); };
  }, [map, token, enabled, species, period, covered, attempt]);

  const retry = useCallback((): void => { setAttempt((count) => count + 1); }, []);
  return { result, status, failure, speciesOptions: options, retry };
}
