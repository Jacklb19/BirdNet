import { Suspense, lazy, useEffect, useRef } from 'react';
import { readPreferences, writePreference } from '../config/storage';
import { useI18n } from '../i18n';
import { useAccountContext } from '../features/account/accountContext';
import { useListening } from '../features/listen/listeningContext';
import { leavePocketMode, usePocketMode } from '../features/listen/pocketMode';
import { PocketScreen } from '../features/listen/PocketScreen';
import { useAutomaticAlternate } from '../features/offline/automaticAlternate';
import { enableAutomaticModel } from '../features/offline/modelStore';
import { useAppUpdate } from '../features/offline/useAppUpdate';
import { Button } from '../shared/ui/Button';
import { Notice } from '../shared/ui/Notice';
import { LivePlayer } from './LivePlayer';
import { PageErrorBoundary } from './PageErrorBoundary';
import { RoutePage } from './pages';
import { isAuthCallback, isSiteRoot, routeHash, sectionOf, useRoute } from './routes';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';
import './AppShell.css';

const HomePage = lazy(() => import('../features/home/HomePage'));

function useDocumentMetadata(title: string, description: string): void {
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}

/**
 * Layout of every screen (ADR-27). The home page and the app are one site under one bar: the bare address opens
 * the home page, any section is one link away, and the bar always leads back. Inside the app the shell adds the
 * skip link, the phone's tab bar and the live player.
 */
export function AppShell(): React.JSX.Element {
  const { dict } = useI18n();
  const [route] = useRoute();
  const { active, walking } = useListening();
  const { session } = useAccountContext();
  const mainRef = useRef<HTMLElement>(null);
  const update = useAppUpdate();
  // Pocket mode covers the app only while a session listens, and does not outlive it.
  const pocket = usePocketMode() && active;
  useEffect(() => { if (!active) leavePocketMode(); }, [active]);
  const inApp = route.name !== 'home';
  useDocumentMetadata(dict.app.documentTitle, dict.app.description);

  // Once the person has opened the app, the model keeps itself installed and up to date without asking (ADR-19).
  useEffect(() => {
    if (inApp) writePreference('welcomed', true);
    if (inApp || readPreferences().welcomed === true) enableAutomaticModel();
  }, [inApp]);
  // And, once it is installed, the second model that listens with it by default comes in the background (ADR-36).
  useAutomaticAlternate(inApp || readPreferences().welcomed === true, dict.settings.detection.second.progressLabel);

  // Someone with a session who opens the bare address comes to use the app, not to read about it. The home page
  // stays one link away, and its own address (`#/home`) is never redirected.
  const signedIn = session !== null;
  useEffect(() => {
    const { hash } = window.location;
    if (signedIn && isSiteRoot(hash) && !isAuthCallback(hash)) window.location.replace(routeHash({ name: 'listen' }));
  }, [signedIn]);

  const loading = <p className="bn-shell__loading" role="status">{dict.common.loading}</p>;
  if (route.name === 'home') {
    return (
      <main id="main" className="bn-shell__home">
        <Suspense fallback={loading}><HomePage /></Suspense>
      </main>
    );
  }

  const section = sectionOf(route);
  // The listening screen and the map of a walk carry the session's own controls; elsewhere the live player does.
  const player = active && route.name !== 'listen' && !(walking && route.name === 'map');
  return (
    <>
      <div className={`bn-shell${player ? ' bn-shell--with-player' : ''}`} inert={pocket}>
        {/* A hash link would be read as a route, so the skip link moves focus itself. */}
        <a className="bn-shell__skip" href="#main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>
          {dict.app.skipToContent}
        </a>
        <TopBar current={section} route={route.name} />
        <main id="main" ref={mainRef} tabIndex={-1} className="bn-shell__main">
          {update.ready && (
            <div className="bn-shell__update">
              <Notice tone="info" icon="download" live action={<Button variant="secondary" onClick={update.apply}>{dict.app.update.action}</Button>}>
                {active ? dict.app.update.listening : dict.app.update.text}
              </Notice>
            </div>
          )}
          <PageErrorBoundary key={route.name} message={dict.app.pageError} actionLabel={dict.app.reload}>
            <Suspense fallback={loading}><RoutePage route={route} /></Suspense>
          </PageErrorBoundary>
        </main>
        {player && <LivePlayer variant="bar" />}
        <TabBar current={section} />
      </div>
      {pocket && <PocketScreen />}
    </>
  );
}
