import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { approximateLocation } from '../offline/queuePolicy';
import { MAP_LOCATE } from './map.config';

export type LocateError = 'denied' | 'unavailable';

export interface LocateState {
  /** False when the browser has no geolocation at all; the button is then not offered. */
  readonly supported: boolean;
  readonly busy: boolean;
  readonly error: LocateError | null;
  readonly locate: () => void;
  readonly dismiss: () => void;
}

const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * Centres the map on the person's approximate cell, in the middle of the part the panel leaves visible. The
 * device fix is rounded to the location grid before it is used, so the exact position never reaches the map,
 * the URL or the API (whose query is the visible area).
 */
export function useLocate(map: MapLibreMap | null, focusOffset: () => [number, number]): LocateState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocateError | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const locate = useCallback((): void => {
    if (!map || !supported) return;
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        setBusy(false);
        let cell: ReturnType<typeof approximateLocation>;
        try {
          cell = approximateLocation(position.coords.latitude, position.coords.longitude);
        } catch {
          setError('unavailable');
          return;
        }
        // Not marked essential, so MapLibre jumps without animation when reduced motion is requested.
        map.easeTo({ center: [cell.longitude, cell.latitude], zoom: Math.max(map.getZoom(), MAP_LOCATE.zoom), offset: focusOffset() });
      },
      (failure) => {
        if (!mounted.current) return;
        setBusy(false);
        setError(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      MAP_LOCATE.position,
    );
  }, [map, focusOffset]);

  const dismiss = useCallback((): void => { setError(null); }, []);
  return { supported, busy, error, locate, dismiss };
}
