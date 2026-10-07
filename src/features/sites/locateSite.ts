import { isGeolocationAvailable, LOCATION_OPTIONS } from '../audio/location';
import { approximateLocation } from '../offline/queuePolicy';
import type { ApproximateLocation } from '../offline/types';

export type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export type LocationResult =
  | { readonly ok: true; readonly location: ApproximateLocation }
  | { readonly ok: false; readonly failure: LocationFailure };

/**
 * One position for a new site, already reduced to its approximate cell: raw coordinates never leave this
 * function, so they are never kept in the form's state. It shares the listening session's options for the same
 * reasons (coarse accuracy is enough for a ~100 m cell, no cached fix from another place, bounded wait).
 */
export function locateSite(): Promise<LocationResult> {
  if (!isGeolocationAvailable()) return Promise.resolve({ ok: false, failure: 'unsupported' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve({ ok: true, location: approximateLocation(position.coords.latitude, position.coords.longitude) });
        } catch {
          // Coordinates outside the valid range: better no site than one in the wrong place.
          resolve({ ok: false, failure: 'unavailable' });
        }
      },
      (error) => {
        const failure: LocationFailure = error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable';
        resolve({ ok: false, failure });
      },
      LOCATION_OPTIONS,
    );
  });
}
