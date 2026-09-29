import { useState } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { ThemeProvider } from './theme';
import { DiagnosticoPage } from './features/diagnostico/DiagnosticoPage';
import { AudioCapturePanel } from './features/audio/components/AudioCapturePanel';
import { SettingsPage } from './features/settings/SettingsPage';

type ActiveView = 'capture' | 'diagnostics' | 'settings';

function AppLayout(): React.JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('capture');
  const { dict } = useI18n();

  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'capture', label: dict.app.navCapture },
    { id: 'diagnostics', label: dict.app.navDiagnostics },
    { id: 'settings', label: dict.app.navSettings },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          padding: 'var(--spacing-4)',
          backgroundColor: 'var(--color-surface)',
          transition: 'var(--transition-colors)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--container-max-width)',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--spacing-4)',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'var(--font-size-xl)',
                margin: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              {dict.app.title}
            </h1>
            <p
              style={{
                margin: 'var(--spacing-1) 0 0',
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text-subtle)',
              }}
            >
              {dict.app.subtitle}
            </p>
          </div>
          <nav aria-label={dict.app.navAria}>
            <ul
              style={{
                display: 'flex',
                gap: 'var(--spacing-2)',
                listStyle: 'none',
                margin: 0,
                padding: 0,
                flexWrap: 'wrap',
              }}
            >
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { setActiveView(item.id); }}
                    aria-current={activeView === item.id ? 'page' : undefined}
                    style={{
                      minHeight: 'var(--touch-target-min)',
                      minWidth: 'var(--touch-target-min)',
                      padding: 'var(--spacing-2) var(--spacing-4)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid',
                      borderColor:
                        activeView === item.id
                          ? 'var(--color-primary)'
                          : 'var(--color-border-subtle)',
                      backgroundColor:
                        activeView === item.id
                          ? 'var(--color-surface-raised)'
                          : 'transparent',
                      color:
                        activeView === item.id
                          ? 'var(--color-primary)'
                          : 'var(--color-text-secondary)',
                      fontWeight:
                        activeView === item.id
                          ? 'var(--font-weight-semibold)'
                          : 'var(--font-weight-regular)',
                      cursor: 'pointer',
                      fontSize: 'var(--font-size-base)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'var(--transition-colors)',
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 'var(--container-max-width)', margin: '0 auto', width: '100%' }}>
        {activeView === 'capture' && <AudioCapturePanel />}
        {activeView === 'diagnostics' && <DiagnosticoPage />}
        {activeView === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AppLayout />
      </I18nProvider>
    </ThemeProvider>
  );
}

export default App;
