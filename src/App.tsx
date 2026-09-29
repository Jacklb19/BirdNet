import { useState } from 'react';
import { DiagnosticoPage } from './features/diagnostico/DiagnosticoPage';
import { AudioCapturePanel } from './features/audio/components/AudioCapturePanel';

export function App(): React.JSX.Element {
  const [vistaActiva, setVistaActiva] = useState<'captura' | 'diagnostico'>('captura');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          padding: 'var(--spacing-4)',
          backgroundColor: 'var(--color-surface)',
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
              BirdNet Local
            </h1>
            <p
              style={{
                margin: 'var(--spacing-1) 0 0',
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text-subtle)',
              }}
            >
              Monitoreo acústico continuo de aves con inferencia en el navegador
            </p>
          </div>
          <nav aria-label="Navegación principal">
            <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
              <button
                type="button"
                onClick={() => {
                  setVistaActiva('captura');
                }}
                aria-pressed={vistaActiva === 'captura'}
                style={{
                  padding: 'var(--spacing-2) var(--spacing-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor:
                    vistaActiva === 'captura'
                      ? 'var(--color-primary)'
                      : 'var(--color-surface)',
                  color:
                    vistaActiva === 'captura'
                      ? 'var(--color-primary-text)'
                      : 'var(--color-text-secondary)',
                  fontWeight: 'var(--font-weight-semibold)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-base)',
                }}
              >
                Captura acústica
              </button>
              <button
                type="button"
                onClick={() => {
                  setVistaActiva('diagnostico');
                }}
                aria-pressed={vistaActiva === 'diagnostico'}
                style={{
                  padding: 'var(--spacing-2) var(--spacing-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor:
                    vistaActiva === 'diagnostico'
                      ? 'var(--color-primary)'
                      : 'var(--color-surface)',
                  color:
                    vistaActiva === 'diagnostico'
                      ? 'var(--color-primary-text)'
                      : 'var(--color-text-secondary)',
                  fontWeight: 'var(--font-weight-semibold)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-base)',
                }}
              >
                Diagnóstico de plataforma
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          maxWidth: 'var(--container-max-width)',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {vistaActiva === 'captura' ? <AudioCapturePanel /> : <DiagnosticoPage />}
      </main>
    </div>
  );
}

export default App;
