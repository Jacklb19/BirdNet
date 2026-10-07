import { lazy, Suspense, useState } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme';
import { AudioCapturePanel } from './features/audio/components/AudioCapturePanel';
import { SettingsPage } from './features/settings/SettingsPage';
import { AccountPage } from './features/account/AccountPage';
import { useAccount } from './features/account/useAccount';
import { FieldIcon, type FieldIconName } from './shared/FieldIcon';

// MapLibre is large; load it only when the map is opened so capture starts fast.
const MapPage = lazy(() => import('./features/map/MapPage'));

type ActiveView = 'capture' | 'map' | 'account' | 'settings';

function AppLayout(): React.JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('capture');
  const { dict } = useI18n();
  const account = useAccount();
  const navItems: { id: ActiveView; label: string; shortLabel: string; icon: FieldIconName }[] = [
    { id: 'capture', label: dict.app.navCapture, shortLabel: dict.field.capture, icon: 'mic' },
    { id: 'map', label: dict.app.navMap, shortLabel: dict.app.navMap, icon: 'map' },
    { id: 'account', label: dict.app.navAccount, shortLabel: dict.app.navAccount, icon: 'user' },
    { id: 'settings', label: dict.app.navSettings, shortLabel: dict.app.navSettings, icon: 'settings' },
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg className="field-icon" viewBox="0 0 32 32" fill="currentColor" focusable="false">
                <path d="M3 8 14 14 29 4 23 21 14 16 8 28Z" />
                <path d="m25 25 3 3m0-8 3 1" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
            <div><h1>{dict.app.title}</h1><p>{dict.field.localProcessing}</p></div>
          </div>
          <nav className="main-nav" aria-label={dict.app.navAria}>
            <ul>{navItems.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => { setActiveView(item.id); }}
                  aria-label={item.label} aria-current={activeView === item.id ? 'page' : undefined}
                  style={{ minHeight: 'var(--touch-target-min)' }}>
                  <FieldIcon name={item.icon} /><span>{item.shortLabel}</span>
                </button>
              </li>
            ))}</ul>
          </nav>
        </div>
      </header>
      <main className="app-main">
        {activeView === 'capture' && <AudioCapturePanel />}
        {activeView === 'map' && <Suspense fallback={<p className="page">{dict.map.loading}</p>}><MapPage accessToken={account.session?.access_token ?? null} /></Suspense>}
        {activeView === 'account' && <AccountPage account={account} />}
        {activeView === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  return <ThemeProvider><I18nProvider><AppLayout /></I18nProvider></ThemeProvider>;
}
export default App;
