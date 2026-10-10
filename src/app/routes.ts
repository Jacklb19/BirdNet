import { useEffect, useState } from 'react';
import { FIELD_LIMITS, isUuid } from '../config/contract';

export type Route =
  | { name: 'listen' } | { name: 'log' } | { name: 'album' } | { name: 'detection'; id: string }
  | { name: 'map'; species?: string } | { name: 'sites' } | { name: 'site'; id: string }
  | { name: 'species'; species: string } | { name: 'account' } | { name: 'settings' } | { name: 'home' };

/** Path of the guide: the album of recorded species and the birds still to find (`#/guide`). */
const GUIDE_PATH = 'guide';
/** Where the album lived in S7 (`#/log/album`); old links still open it. */
const LEGACY_ALBUM_SEGMENT = 'album';
/** Query parameter of the map that opens it filtered to one species (`#/map?species=…`). */
const MAP_SPECIES_PARAM = 'species';

/** A scientific name read from the address: decoded, trimmed and within the API's species limit, or null. */
function speciesFrom(encoded: string | null | undefined): string | null {
  if (!encoded) return null;
  let name: string;
  try { name = decodeURIComponent(encoded).trim(); } catch { return null; }
  return name && name.length <= FIELD_LIMITS.speciesName ? name : null;
}

/** Hash routes keep a static deployment and give the phone's back button real history. */
export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section = '', ...rest] = path.split('/');
  const id = rest.join('/');
  switch (section) {
    case GUIDE_PATH: return { name: 'album' };
    case 'log':
      if (id === LEGACY_ALBUM_SEGMENT) return { name: 'album' };
      return isUuid(id) ? { name: 'detection', id } : { name: 'log' };
    case 'sites': return isUuid(id) ? { name: 'site', id } : { name: 'sites' };
    case 'map': {
      const species = speciesFrom(new URLSearchParams(query).get(MAP_SPECIES_PARAM));
      return species ? { name: 'map', species } : { name: 'map' };
    }
    case 'species': {
      const species = speciesFrom(id);
      return species ? { name: 'species', species } : { name: 'album' };
    }
    case 'account': return { name: 'account' };
    case 'settings': return { name: 'settings' };
    // "welcome" was the first-run screen until S6; old links land on the home page that replaced it.
    case 'home': case 'welcome': return { name: 'home' };
    default: return { name: 'listen' };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'detection': return `#/log/${route.id}`;
    case 'album': return `#/${GUIDE_PATH}`;
    case 'site': return `#/sites/${route.id}`;
    case 'species': return `#/species/${encodeURIComponent(route.species)}`;
    case 'map': return route.species ? `#/map?${new URLSearchParams({ [MAP_SPECIES_PARAM]: route.species }).toString()}` : '#/map';
    case 'listen': return '#/listen';
    default: return `#/${route.name}`;
  }
}

/** Top-level section a route belongs to, for navigation highlighting. */
export function sectionOf(route: Route): 'listen' | 'map' | 'guide' | 'log' | 'account' {
  switch (route.name) {
    case 'album': case 'species': return 'guide';
    case 'detection': return 'log';
    case 'sites': case 'site': return 'map';
    case 'settings': case 'home': return 'account';
    default: return route.name;
  }
}

/** Programmatic navigation (after a form or a first-run step); links use `href={routeHash(...)}` instead. */
export function navigateTo(route: Route): void {
  window.location.hash = routeHash(route);
}

/**
 * Supabase returns from Google and from the password e-mail with its tokens in the hash (`#access_token=…`). The
 * client reads and removes them itself; until then the hash is not a route and must not be parsed as one.
 */
export function isAuthCallback(hash: string): boolean {
  return /(^|[#&])(access_token|error_description|error)=/.test(hash);
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const changed = (): void => {
      if (isAuthCallback(window.location.hash)) return;
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('hashchange', changed); };
  }, []);
  return [route, navigateTo];
}
