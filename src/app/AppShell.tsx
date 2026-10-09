import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { readPreferences, writePreference } from '../config/storage';
import { useI18n } from '../i18n';
import { useListening } from '../features/listen/listeningContext';
import { enableAutomaticModel } from '../features/offline/modelStore';
import { LivePlayer } from './LivePlayer';
import { PageErrorBoundary } from './PageErrorBoundary';
import { RoutePage } from './pages';
import { navigateTo, sectionOf, useRoute } from './routes';
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

/** Layout of every screen: skip link, navigation for the current width, the page, and the live player. */
export function AppShell(): React.JSX.Element {
  const { dict } = useI18n();
  const [route] = useRoute();
  const { active } = useListening();
  const mainRef = useRef<HTMLElement>(null);
  const [welcomed, setWelcomed] = useState(() => readPreferences().welcomed === true);
  useDocumentMetadata(dict.app.documentTitle, dict.app.description);

  // Once the person has entered the app, the model keeps itself installed and up to date without asking (ADR-19).
  useEffect(() => { if (welcomed) enableAutomaticModel(); }, [welcomed]);

  const enter = useCallback((destination: 'listen' | 'account'): void => {
    writePreference('welcomed', true);
    setWelcomed(true);
    navigateTo({ name: destination });
  }, []);

  const loading = <p className="bn-shell__loading" role="status">{dict.common.loading}</p>;
  if (!welcomed || route.name === 'home') {
    return (
      <main id="main" className="bn-shell__home">
        <Suspense fallback={loading}><HomePage onEnter={enter} /></Suspense>
      </main>
    );
  }

  const section = sectionOf(route);
  return (
    <div className={`bn-shell${active && route.name !== 'listen' ? ' bn-shell--with-player' : ''}`}>
      {/* A hash link would be read as a route, so the skip link moves focus itself. */}
      <a className="bn-shell__skip" href="#main" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>
        {dict.app.skipToContent}
      </a>
      <TopBar current={section} />
      <main id="main" ref={mainRef} tabIndex={-1} className="bn-shell__main">
        <PageErrorBoundary key={route.name} message={dict.app.pageError} actionLabel={dict.app.reload}>
          <Suspense fallback={loading}><RoutePage route={route} /></Suspense>
        </PageErrorBoundary>
      </main>
      {route.name !== 'listen' && <LivePlayer variant="bar" />}
      <TabBar current={section} />
    </div>
  );
}
