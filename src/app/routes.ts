import { useEffect, useState } from 'react';
import { FIELD_LIMITS, isUuid } from '../config/contract';
import { HOME_SECTIONS, type HomeSection } from '../features/home/home.config';
import { GUIDE_QUERY_MAX_LENGTH } from '../features/species/species.config';

export type Route =
  | { name: 'listen' } | { name: 'log' } | { name: 'album'; query?: string } | { name: 'detection'; id: string }
  | { name: 'map'; species?: string } | { name: 'sites' } | { name: 'site'; id: string }
  | { name: 'species'; species: string } | { name: 'account' } | { name: 'settings' } | { name: 'home'; section?: HomeSection }
  | { name: 'walks' } | { name: 'walk'; id: string } | { name: 'signIn' } | { name: 'signUp' } | { name: 'notFound' }
  | { name: 'journal' } | { name: 'outing'; id: string } | { name: 'observations'; id?: string } | { name: 'collections'; id?: string } | { name: 'wishlist' } | { name: 'importAudio' } | { name: 'assistant' };

/**
 * Screens anyone can open without signing in (ADR-45): the home page, the way in and the guide of birds, which holds
 * only public facts. Every other screen is the person's own and opens only with an account.
 */
export function isPublicRoute(route: Route): boolean {
  switch (route.name) {
    case 'home': case 'signIn': case 'signUp': case 'album': case 'species': case 'notFound': return true;
    default: return false;
  }
}

/** Path of the guide: the album of recorded species and the birds still to find (`#/guide`). */
const GUIDE_PATH = 'guide';
/** Where the album lived in S7 (`#/log/album`); old links still open it. */
const LEGACY_ALBUM_SEGMENT = 'album';
/** Query parameter of the map that opens it filtered to one species (`#/map?species=…`). */
const MAP_SPECIES_PARAM = 'species';
/** Query parameter of the home page that scrolls to one of its sections (`#/home?section=how`). */
const HOME_SECTION_PARAM = 'section';
/** Query parameter of the guide that opens it already searching (`#/guide?q=…`), as the home page's search does. */
const GUIDE_QUERY_PARAM = 'q';

function homeSectionFrom(value: string | null): HomeSection | null {
  return HOME_SECTIONS.find((section) => section === value) ?? null;
}

function guideQueryFrom(value: string | null): string | null {
  const query = value?.trim() ?? '';
  return query && query.length <= GUIDE_QUERY_MAX_LENGTH ? query : null;
}

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
    case 'journal': return isUuid(id) ? { name: 'outing', id } : { name: 'journal' };
    case 'observations': return isUuid(id) ? { name: 'observations', id } : { name: 'observations' };
    case 'collections': return isUuid(id) ? { name: 'collections', id } : { name: 'collections' };
    case 'wishlist': return { name: 'wishlist' };
    case 'import': return { name: 'importAudio' };
    case 'assistant': return { name: 'assistant' };
    case GUIDE_PATH: {
      const search = guideQueryFrom(new URLSearchParams(query).get(GUIDE_QUERY_PARAM));
      return search ? { name: 'album', query: search } : { name: 'album' };
    }
    case 'log':
      if (id === LEGACY_ALBUM_SEGMENT) return { name: 'album' };
      return isUuid(id) ? { name: 'detection', id } : { name: 'log' };
    case 'sites': return isUuid(id) ? { name: 'site', id } : { name: 'sites' };
    case 'walks': return isUuid(id) ? { name: 'walk', id } : { name: 'walks' };
    case 'map': {
      const species = speciesFrom(new URLSearchParams(query).get(MAP_SPECIES_PARAM));
      return species ? { name: 'map', species } : { name: 'map' };
    }
    case 'species': {
      const species = speciesFrom(id);
      return species ? { name: 'species', species } : { name: 'album' };
    }
    case 'listen': return { name: 'listen' };
    case 'account': return { name: 'account' };
    case 'settings': return { name: 'settings' };
    case 'signin': return { name: 'signIn' };
    case 'signup': return { name: 'signUp' };
    // The bare address is the home page (ADR-27). "welcome" was the first-run screen until S6; old links land here too.
    case '': case 'home': case 'welcome': {
      const section = homeSectionFrom(new URLSearchParams(query).get(HOME_SECTION_PARAM));
      return section ? { name: 'home', section } : { name: 'home' };
    }
    // A mistyped or outdated address says so, instead of opening a screen the person did not ask for (audit U6).
    default: return { name: 'notFound' };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'importAudio': return '#/import';
    case 'outing': return `#/journal/${route.id}`;
    case 'observations': case 'collections': return `#/${route.name}${route.id ? `/${route.id}` : ''}`;
    case 'detection': return `#/log/${route.id}`;
    case 'album': return route.query ? `#/${GUIDE_PATH}?${new URLSearchParams({ [GUIDE_QUERY_PARAM]: route.query }).toString()}` : `#/${GUIDE_PATH}`;
    case 'home': return route.section ? `#/home?${new URLSearchParams({ [HOME_SECTION_PARAM]: route.section }).toString()}` : '#/home';
    case 'site': return `#/sites/${route.id}`;
    case 'walk': return `#/walks/${route.id}`;
    case 'species': return `#/species/${encodeURIComponent(route.species)}`;
    case 'map': return route.species ? `#/map?${new URLSearchParams({ [MAP_SPECIES_PARAM]: route.species }).toString()}` : '#/map';
    case 'listen': return '#/listen';
    case 'signIn': return '#/signin';
    case 'signUp': return '#/signup';
    default: return `#/${route.name}`;
  }
}

/** Top-level section a route belongs to, for navigation highlighting. */
export function sectionOf(route: Route): 'listen' | 'map' | 'guide' | 'log' | 'account' | null {
  switch (route.name) {
    case 'album': case 'species': return 'guide';
    case 'detection': case 'walks': case 'walk': case 'journal': case 'outing': case 'observations': case 'collections': case 'wishlist': case 'importAudio': case 'assistant': return 'log';
    case 'sites': case 'site': return 'map';
    case 'settings': case 'home': return 'account';
    // Belong to no section, so none is marked.
    case 'notFound': case 'signIn': case 'signUp': return null;
    default: return route.name;
  }
}

/** The bare address of the site, with no route in it: where a visit starts. */
export function isSiteRoot(hash: string): boolean {
  return hash.replace(/^#\/?/, '') === '';
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
