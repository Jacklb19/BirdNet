import { useEffect, useState } from 'react';
import { FIELD_LIMITS, isUuid } from '../config/contract';
import { HOME_SECTIONS, type HomeSection } from '../features/home/home.config';
import { GUIDE_QUERY_MAX_LENGTH } from '../features/species/species.config';

/** Parts of the log (ADR-47): the records, the outings (walks among them) and the collections. */
export const LOG_TABS = ['records', 'outings', 'collections'] as const;
export type LogTab = (typeof LOG_TABS)[number];
/** What the records part lists: the songs the model heard, or the birds the person saw. */
export const RECORD_KINDS = ['songs', 'observations'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
/** Which outings are listed: all of them or one way of going out. */
export const OUTING_FILTERS = ['all', 'walk', 'stationary', 'import'] as const;
export type OutingFilter = (typeof OUTING_FILTERS)[number];
/** Parts of the guide (ADR-47): every bird of the region, the person's album and the birds they want to find. */
export const GUIDE_TABS = ['catalog', 'album', 'wishlist'] as const;
export type GuideTab = (typeof GUIDE_TABS)[number];
/** Sections of Settings an address can scroll to. */
export const SETTINGS_SECTIONS = ['credits'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export type Route =
  | { name: 'home'; section?: HomeSection } | { name: 'signIn' } | { name: 'signUp' } | { name: 'notFound' }
  | { name: 'listen' } | { name: 'importAudio' }
  | { name: 'map'; species?: string } | { name: 'sites' } | { name: 'site'; id: string }
  | { name: 'album'; tab?: GuideTab; query?: string } | { name: 'species'; species: string }
  | { name: 'log'; tab?: LogTab; show?: RecordKind; kind?: OutingFilter }
  | { name: 'detection'; id: string } | { name: 'observations'; id?: string; outing?: string } | { name: 'outing'; id: string } | { name: 'walk'; id: string }
  | { name: 'collection'; id: string }
  | { name: 'assistant' } | { name: 'account' } | { name: 'settings'; section?: SettingsSection };

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

/** Path of the guide (`#/guide`). */
const GUIDE_PATH = 'guide';
/** Where the album lived in S7 (`#/log/album`); old links still open it. */
const LEGACY_ALBUM_SEGMENT = 'album';
/** Query parameter of the map that opens it filtered to one species (`#/map?species=…`). */
const MAP_SPECIES_PARAM = 'species';
/** Query parameter of the home page and of Settings that scrolls to one of its sections. */
const SECTION_PARAM = 'section';
/** Query parameter of the guide that opens it already searching (`#/guide?q=…`), as the home page's search does. */
const GUIDE_QUERY_PARAM = 'q';
/** Query parameter of the part of the log or the guide that is open. */
const TAB_PARAM = 'tab';
const SHOW_PARAM = 'show';
const KIND_PARAM = 'kind';
const OUTING_PARAM = 'outing';

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((entry) => entry === value) ?? null;
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

/** The log at one of its parts; the defaults (records, songs, every outing) stay out of the address. */
function logRoute(tab: LogTab | null, show: RecordKind | null, kind: OutingFilter | null): Route {
  if (tab === 'outings') return kind && kind !== 'all' ? { name: 'log', tab, kind } : { name: 'log', tab };
  if (tab === 'collections') return { name: 'log', tab };
  return show === 'observations' ? { name: 'log', show } : { name: 'log' };
}

function guideRoute(tab: GuideTab | null, query: string | null): Route {
  return { name: 'album', ...(tab && tab !== 'album' ? { tab } : {}), ...(query ? { query } : {}) };
}

/** Hash routes keep a static deployment and give the phone's back button real history. */
export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [section = '', ...rest] = path.split('/');
  const id = rest.join('/');
  const params = new URLSearchParams(query);
  switch (section) {
    case 'log':
      if (id === LEGACY_ALBUM_SEGMENT) return { name: 'album' };
      if (isUuid(id)) return { name: 'detection', id };
      return logRoute(oneOf(LOG_TABS, params.get(TAB_PARAM)), oneOf(RECORD_KINDS, params.get(SHOW_PARAM)), oneOf(OUTING_FILTERS, params.get(KIND_PARAM)));
    // Before ADR-47 outings, walks and collections had lists of their own; their addresses open the log's part.
    case 'journal': return isUuid(id) ? { name: 'outing', id } : logRoute('outings', null, null);
    case 'walks': return isUuid(id) ? { name: 'walk', id } : logRoute('outings', null, 'walk');
    case 'collections': return isUuid(id) ? { name: 'collection', id } : logRoute('collections', null, null);
    case 'observations': {
      if (isUuid(id)) return { name: 'observations', id };
      // A new observation added from an outing's page starts in that outing.
      const outing = params.get(OUTING_PARAM) ?? '';
      return isUuid(outing) ? { name: 'observations', outing } : { name: 'observations' };
    }
    case GUIDE_PATH: return guideRoute(oneOf(GUIDE_TABS, params.get(TAB_PARAM)), guideQueryFrom(params.get(GUIDE_QUERY_PARAM)));
    case 'wishlist': return guideRoute('wishlist', null);
    case 'species': {
      const species = speciesFrom(id);
      return species ? { name: 'species', species } : { name: 'album' };
    }
    case 'listen': return id === 'import' ? { name: 'importAudio' } : { name: 'listen' };
    case 'import': return { name: 'importAudio' };
    case 'map': {
      const species = speciesFrom(params.get(MAP_SPECIES_PARAM));
      return species ? { name: 'map', species } : { name: 'map' };
    }
    case 'sites': return isUuid(id) ? { name: 'site', id } : { name: 'sites' };
    case 'assistant': return { name: 'assistant' };
    case 'account': return { name: 'account' };
    case 'settings': {
      const part = oneOf(SETTINGS_SECTIONS, params.get(SECTION_PARAM));
      return part ? { name: 'settings', section: part } : { name: 'settings' };
    }
    case 'signin': return { name: 'signIn' };
    case 'signup': return { name: 'signUp' };
    // The bare address is the home page (ADR-27). "welcome" was the first-run screen until S6; old links land here too.
    case '': case 'home': case 'welcome': {
      const part = oneOf(HOME_SECTIONS, params.get(SECTION_PARAM));
      return part ? { name: 'home', section: part } : { name: 'home' };
    }
    // A mistyped or outdated address says so, instead of opening a screen the person did not ask for (audit U6).
    default: return { name: 'notFound' };
  }
}

function withQuery(path: string, entries: Readonly<Record<string, string | undefined>>): string {
  const params = new URLSearchParams(Object.entries(entries).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home': return withQuery('#/home', { [SECTION_PARAM]: route.section });
    case 'signIn': return '#/signin';
    case 'signUp': return '#/signup';
    case 'importAudio': return '#/listen/import';
    case 'map': return withQuery('#/map', { [MAP_SPECIES_PARAM]: route.species });
    case 'site': return `#/sites/${route.id}`;
    case 'album': return withQuery(`#/${GUIDE_PATH}`, { [TAB_PARAM]: route.tab, [GUIDE_QUERY_PARAM]: route.query });
    case 'species': return `#/species/${encodeURIComponent(route.species)}`;
    case 'log': return withQuery('#/log', { [TAB_PARAM]: route.tab, [SHOW_PARAM]: route.show, [KIND_PARAM]: route.kind });
    case 'detection': return `#/log/${route.id}`;
    case 'observations': return route.id ? `#/observations/${route.id}` : withQuery('#/observations', { [OUTING_PARAM]: route.outing });
    case 'outing': return `#/journal/${route.id}`;
    case 'walk': return `#/walks/${route.id}`;
    case 'collection': return `#/collections/${route.id}`;
    case 'settings': return withQuery('#/settings', { [SECTION_PARAM]: route.section });
    default: return `#/${route.name}`;
  }
}

/** Top-level section a route belongs to, for navigation highlighting (ADR-47). */
export function sectionOf(route: Route): 'listen' | 'map' | 'guide' | 'log' | 'assistant' | null {
  switch (route.name) {
    case 'listen': case 'importAudio': return 'listen';
    case 'map': case 'sites': case 'site': return 'map';
    case 'album': case 'species': return 'guide';
    case 'log': case 'detection': case 'observations': case 'outing': case 'walk': case 'collection': return 'log';
    case 'assistant': return 'assistant';
    // The account's own screens, the home page and the way in belong to no section, so none is marked.
    default: return null;
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

/** How far down each address was read, so coming back to a list (Back, or its tab) returns to the same place. */
const readPositions = new Map<string, number>();
/** Frames spent waiting for a list to grow tall enough to return to its place (its data arrives after the screen). */
const RESTORE_FRAMES = 30;

function restorePosition(hash: string): () => void {
  const target = readPositions.get(hash) ?? 0;
  let frames = 0;
  let request = 0;
  const step = (): void => {
    const reachable = document.documentElement.scrollHeight - window.innerHeight >= target;
    if (reachable || frames++ >= RESTORE_FRAMES) { window.scrollTo(0, target); return; }
    request = requestAnimationFrame(step);
  };
  if (target === 0) window.scrollTo(0, 0);
  else request = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(request); };
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    let previous = window.location.hash;
    let cancel = (): void => undefined;
    const changed = (): void => {
      if (isAuthCallback(window.location.hash)) return;
      readPositions.set(previous, window.scrollY);
      previous = window.location.hash;
      setRoute(parseRoute(previous));
      cancel();
      cancel = restorePosition(previous);
    };
    window.addEventListener('hashchange', changed);
    return () => { cancel(); window.removeEventListener('hashchange', changed); };
  }, []);
  return [route, navigateTo];
}
