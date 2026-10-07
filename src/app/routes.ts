import { useEffect, useState } from 'react';
import { isUuid } from '../config/contract';

export type Route =
  | { name: 'listen' } | { name: 'log' } | { name: 'detection'; id: string } | { name: 'map' }
  | { name: 'sites' } | { name: 'site'; id: string } | { name: 'account' } | { name: 'settings' } | { name: 'welcome' };

/** Hash routes keep a static deployment and give the phone's back button real history. */
export function parseRoute(hash: string): Route {
  const [section = '', id] = hash.replace(/^#\/?/, '').split('/');
  switch (section) {
    case 'log': return isUuid(id) ? { name: 'detection', id } : { name: 'log' };
    case 'sites': return isUuid(id) ? { name: 'site', id } : { name: 'sites' };
    case 'map': return { name: 'map' };
    case 'account': return { name: 'account' };
    case 'settings': return { name: 'settings' };
    case 'welcome': return { name: 'welcome' };
    default: return { name: 'listen' };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'detection': return `#/log/${route.id}`;
    case 'site': return `#/sites/${route.id}`;
    case 'listen': return '#/listen';
    default: return `#/${route.name}`;
  }
}

/** Top-level section a route belongs to, for navigation highlighting. */
export function sectionOf(route: Route): 'listen' | 'log' | 'map' | 'sites' | 'account' {
  if (route.name === 'detection') return 'log';
  if (route.name === 'site') return 'sites';
  if (route.name === 'settings' || route.name === 'welcome') return 'account';
  return route.name;
}

/** Programmatic navigation (after a form or a first-run step); links use `href={routeHash(...)}` instead. */
export function navigateTo(route: Route): void {
  window.location.hash = routeHash(route);
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const changed = (): void => { setRoute(parseRoute(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', changed);
    return () => { window.removeEventListener('hashchange', changed); };
  }, []);
  return [route, navigateTo];
}
