import { Suspense, lazy, useEffect, useRef } from 'react';
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
import { PublicBar } from './PublicBar';
import { isAuthCallback, isPublicRoute, isSiteRoot, routeHash, sectionOf, useRoute, type Route } from './routes';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';
import './AppShell.css';

const HomePage = lazy(() => import('../features/home/HomePage'));
const EntrancePage = lazy(() => import('../features/account/EntrancePage'));

function useDocumentMetadata(title: string, description: string): void {
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}

/**
 * Layout of every screen (ADR-27, ADR-45). The home page and the app are one site under one bar: the bare address
 * opens the home page and the bar always leads back. The app opens only with an account: without one, every screen
 * of it shows the way in at its own address, and the person lands on what they asked for once signed in. Without a
 * session the site is the home page, the way in and the guide of birds, under a bar that offers nothing else.
 * Inside the app the shell adds the skip link, the phone's tab bar and the live player.
 */
export function AppShell(): React.JSX.Element {
  const { dict, sections } = useI18n();
  const [route] = useRoute();
  const { active, walking } = useListening();
  const { identity, ready } = useAccountContext();
  const signedIn = identity !== null;
  const mainRef = useRef<HTMLElement>(null);
  const update = useAppUpdate();
  // Pocket mode covers the app only while a session listens, and does not outlive it.
  const pocket = usePocketMode() && active;
  useEffect(() => { if (!active) leavePocketMode(); }, [active]);
  // A screen of the account asked for without one shows the way in, titled as such.
  const gated = !signedIn && !isPublicRoute(route);
  const titled: Route['name'] = gated ? 'signIn' : route.name;
  useDocumentMetadata(titled === 'home' ? dict.app.documentTitle : dict.app.pageTitle(dict.app.screens[titled]), dict.app.description);

  // A new screen takes the focus to its heading, so the keyboard and screen readers start there instead of in the
  // bar (audit F08). Not on the first screen of a visit, nor when only the query of the same screen changes.
  // Signing in replaces the way in with the screen that was asked for, at the same address: that is a new screen too.
  const screenKey = `${'id' in route ? `${route.name}:${route.id}` : route.name}:${signedIn ? 'in' : 'out'}`;
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) { firstScreen.current = false; return; }
    const main = document.getElementById('main');
    if (!main) return;
    let frames = 0;
    let request = 0;
    // The section's code may still be arriving: look for its heading for a moment, then settle for the main region.
    const focus = (): void => {
      const heading = main.querySelector<HTMLElement>('h1');
      if (!heading && frames++ < 60) { request = requestAnimationFrame(focus); return; }
      const target = heading ?? main;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    request = requestAnimationFrame(focus);
    return () => { cancelAnimationFrame(request); };
  }, [screenKey]);

  // Once signed in, the model keeps itself installed and up to date without asking (ADR-19); without an account
  // nothing of it is downloaded, since nothing of the app opens (ADR-45).
  useEffect(() => {
    if (signedIn) enableAutomaticModel();
  }, [signedIn]);
  // And, once it is installed, the second model that listens with it by default comes in the background (ADR-36).
  useAutomaticAlternate(signedIn, dict.app.secondModelDownload);

  // Someone with a session who opens the bare address, or the way in, comes to use the app, not to read about it.
  // The home page stays one link away, and its own address (`#/home`) is never redirected.
  const atWayIn = route.name === 'signIn' || route.name === 'signUp';
  useEffect(() => {
    const { hash } = window.location;
    if (signedIn && (atWayIn || isSiteRoot(hash)) && !isAuthCallback(hash)) window.location.replace(routeHash({ name: 'listen' }));
  }, [signedIn, atWayIn]);

  const loading = <p className="bn-shell__loading" role="status">{dict.common.loading}</p>;
  // A section draws only with its texts, which arrive in their own file with the section's code.
  const withTexts = (page: React.JSX.Element): React.JSX.Element => {
    if (sections === 'ready') return page;
    if (sections === 'loading') return loading;
    return (
      <div className="bn-shell__error">
        <Notice tone="error" icon="offline" action={<Button variant="quiet" onClick={() => { window.location.reload(); }}>{dict.app.reload}</Button>}>
          {dict.app.pageError}
        </Notice>
      </div>
    );
  };
  if (route.name === 'home') {
    return (
      <main id="main" className="bn-shell__home">
        {withTexts(<Suspense fallback={loading}><HomePage /></Suspense>)}
      </main>
    );
  }

  if (!signedIn) {
    // Until Auth answers there is no telling whether the person is signed in: a brief wait, not the way in.
    const waiting = !ready && (gated || atWayIn);
    const page = waiting ? loading
      : gated || route.name === 'signIn' || route.name === 'signUp' ? <EntrancePage mode={route.name === 'signUp' ? 'signUp' : 'signIn'} requested={gated ? dict.app.screens[route.name] : null} />
      : <RoutePage route={route} />;
    return (
      <div className="bn-shell bn-shell--public">
        <a className="bn-shell__skip" href="#main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>
          {dict.app.skipToContent}
        </a>
        <PublicBar route={titled} />
        <main id="main" ref={mainRef} tabIndex={-1} className="bn-shell__main">
          <PageErrorBoundary key={titled} message={dict.app.pageError} actionLabel={dict.app.reload}>
            {withTexts(<Suspense fallback={loading}>{page}</Suspense>)}
          </PageErrorBoundary>
        </main>
      </div>
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
            {/* The way in leads to Listen once signed in (above); until the address changes there is nothing to show. */}
            {route.name === 'signIn' || route.name === 'signUp' ? loading : withTexts(<Suspense fallback={loading}><RoutePage route={route} /></Suspense>)}
          </PageErrorBoundary>
        </main>
        {player && <LivePlayer variant="bar" />}
        <TabBar current={section} />
      </div>
      {pocket && <PocketScreen />}
    </>
  );
}
