import { lazy } from 'react';
import type { Route } from './routes';

/**
 * Screens are split into their own chunks so the first paint only loads the shell and the current
 * screen; MapLibre in particular is large and only downloaded when the map is opened.
 */
const ListenPage = lazy(() => import('../features/listen/ListenPage'));
const LogPage = lazy(() => import('../features/log/LogPage'));
const DetectionPage = lazy(() => import('../features/log/DetectionPage'));
const MapPage = lazy(() => import('../features/map/MapPage'));
const SitesPage = lazy(() => import('../features/sites/SitesPage'));
const SitePage = lazy(() => import('../features/sites/SitePage'));
const AccountPage = lazy(() => import('../features/account/AccountPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));

/** The screen for a route; the welcome route is handled by the shell because it has no navigation. */
export function RoutePage({ route }: { readonly route: Exclude<Route, { name: 'welcome' }> }): React.JSX.Element {
  switch (route.name) {
    case 'listen': return <ListenPage />;
    case 'log': return <LogPage />;
    case 'detection': return <DetectionPage id={route.id} />;
    case 'map': return <MapPage />;
    case 'sites': return <SitesPage />;
    case 'site': return <SitePage id={route.id} />;
    case 'account': return <AccountPage />;
    case 'settings': return <SettingsPage />;
  }
}
