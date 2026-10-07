import { approximateLocation } from '../offline/queuePolicy';
import type { ApproximateLocation } from '../offline/types';

/**
 * Geolocation options of a listening session (ADR-04). Detections keep only a ~100 m cell, so a
 * GPS-grade fix adds no information while draining the battery and exposing a precise position to the
 * page: coarse accuracy is requested. Cached fixes are refused because one could come from a previous
 * place and file detections in the wrong cell. The timeout bounds each acquisition attempt so a
 * device without a fix reports it instead of waiting indefinitely.
 */
export const LOCATION_WATCH_OPTIONS: Readonly<PositionOptions> = Object.freeze({
  enableHighAccuracy: false,
  maximumAge: 0,
  timeout: 30_000,
});

/** Whether this browser exposes the Geolocation API at all. */
export function isGeolocationAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Watches the device position and reports only its approximate cell, so raw coordinates never leave
 * this function. `onChange` receives null when the position is unavailable or permission is denied.
 * A timeout keeps the last cell: the watch goes on, and a still device may simply have no new fix.
 *
 * @returns A function that stops the watch; a no-op when geolocation is unavailable.
 */
export function watchApproximateLocation(onChange: (location: ApproximateLocation | null) => void): () => void {
  if (!isGeolocationAvailable()) return () => undefined;
  const { geolocation } = navigator;
  const watchId = geolocation.watchPosition(
    (position) => {
      let location: ApproximateLocation | null;
      try {
        location = approximateLocation(position.coords.latitude, position.coords.longitude);
      } catch {
        // The device reported coordinates outside the valid range; record no location rather than a wrong one.
        location = null;
      }
      onChange(location);
    },
    (error) => {
      if (error.code !== error.TIMEOUT) onChange(null);
    },
    LOCATION_WATCH_OPTIONS,
  );
  return () => { geolocation.clearWatch(watchId); };
}
