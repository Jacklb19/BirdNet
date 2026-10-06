import { useState } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme';
import { DiagnosticoPage } from './features/diagnostico/DiagnosticoPage';
import { AudioCapturePanel } from './features/audio/components/AudioCapturePanel';
import { SettingsPage } from './features/settings/SettingsPage';
import { FieldIcon, type FieldIconName } from './shared/FieldIcon';

type ActiveView = 'capture' | 'diagnostics' | 'settings';

function AppLayout(): React.JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('capture');
  const { dict } = useI18n();
  const navItems: { id: ActiveView; label: string; shortLabel: string; icon: FieldIconName }[] = [
    { id: 'capture', label: dict.app.navCapture, shortLabel: dict.field.capture, icon: 'mic' },
    { id: 'diagnostics', label: dict.app.navDiagnostics, shortLabel: dict.field.diagnostics, icon: 'signal' },
    { id: 'settings', label: dict.app.navSettings, shortLabel: dict.app.navSettings, icon: 'settings' },
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-mark"><FieldIcon name="bird" /></span>
            <div><h1>{dict.app.title}</h1><p>{dict.app.subtitle}</p></div>
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
        {activeView === 'diagnostics' && <DiagnosticoPage />}
        {activeView === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  return <ThemeProvider><I18nProvider><AppLayout /></I18nProvider></ThemeProvider>;
}
export default App;
