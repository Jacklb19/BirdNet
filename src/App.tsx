import { useState } from 'react';
import { DiagnosticoPage } from './features/diagnostico/DiagnosticoPage';
import { AudioCapturePanel } from './features/audio/components/AudioCapturePanel';

export function App(): React.JSX.Element {
  const [vistaActiva, setVistaActiva] = useState<'captura' | 'diagnostico'>('captura');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid #e5e7eb',
          padding: '1rem',
          backgroundColor: '#ffffff',
        }}
      >
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: '#111827' }}>
              BirdNet Local
            </h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Monitoreo acústico continuo de aves con inferencia en el navegador
            </p>
          </div>
          <nav aria-label="Navegación principal">
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setVistaActiva('captura');
                }}
                aria-pressed={vistaActiva === 'captura'}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: vistaActiva === 'captura' ? '#059669' : '#ffffff',
                  color: vistaActiva === 'captura' ? '#ffffff' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
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
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: vistaActiva === 'diagnostico' ? '#059669' : '#ffffff',
                  color: vistaActiva === 'diagnostico' ? '#ffffff' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Diagnóstico de plataforma
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        {vistaActiva === 'captura' ? <AudioCapturePanel /> : <DiagnosticoPage />}
      </main>
    </div>
  );
}

export default App;
