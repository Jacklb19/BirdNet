import { lazy } from 'react';
import type { Route } from './routes';

/**
 * Screens are split into their own chunks so the first paint only loads the shell and the current
 * screen; MapLibre in particular is large and only downloaded when the map is opened.
 */
const ListenPage = lazy(() => import('../features/listen/ListenPage'));
const ImportPage = lazy(() => import('../features/imports/ImportPage'));
const MapPage = lazy(() => import('../features/map/MapPage'));
const SitesPage = lazy(() => import('../features/sites/SitesPage'));
const SitePage = lazy(() => import('../features/sites/SitePage'));
const AlbumPage = lazy(() => import('../features/species/AlbumPage'));
const SpeciesPage = lazy(() => import('../features/species/SpeciesPage'));
const LogPage = lazy(() => import('../features/log/LogPage'));
const DetectionPage = lazy(() => import('../features/log/DetectionPage'));
const ObservationsPage = lazy(() => import('../features/journal/ObservationsPage'));
const OutingPage = lazy(() => import('../features/journal/OutingPage'));
const WalkPage = lazy(() => import('../features/walk/WalkPage'));
const CollectionPage = lazy(() => import('../features/journal/CollectionPage'));
const AssistantPage = lazy(() => import('../features/assistant/AssistantPage'));
const AccountPage = lazy(() => import('../features/account/AccountPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

/** The screen for a route; the home page and the way in are handled by the shell, which decides when they show. */
export function RoutePage({ route }: { readonly route: Exclude<Route, { name: 'home' | 'signIn' | 'signUp' }> }): React.JSX.Element {
  switch (route.name) {
    case 'listen': return <ListenPage />;
    case 'importAudio': return <ImportPage />;
    // Keyed by the species filter, so following another card's map link starts from that species.
    case 'map': return <MapPage key={route.species ?? ''} species={route.species ?? null} />;
    case 'sites': return <SitesPage />;
    case 'site': return <SitePage id={route.id} />;
    // Keyed by the search, so the home page's search opens the guide already searching for it.
    case 'album': return <AlbumPage key={route.query ?? ''} tab={route.tab ?? 'album'} initialQuery={route.query ?? ''} />;
    case 'species': return <SpeciesPage species={route.species} />;
    case 'log': return <LogPage tab={route.tab ?? 'records'} show={route.show ?? 'songs'} kind={route.kind ?? 'all'} />;
    case 'detection': return <DetectionPage id={route.id} />;
    case 'observations': return <ObservationsPage key={route.id ?? `new:${route.outing ?? ''}`} id={route.id} outing={route.outing} />;
    case 'outing': return <OutingPage key={route.id} id={route.id} />;
    case 'walk': return <WalkPage id={route.id} />;
    case 'collection': return <CollectionPage key={route.id} id={route.id} />;
    case 'assistant': return <AssistantPage />;
    case 'account': return <AccountPage />;
    case 'settings': return <SettingsPage section={route.section ?? null} />;
    case 'notFound': return <NotFoundPage />;
  }
}
