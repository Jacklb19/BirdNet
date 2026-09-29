import { useAudioCapture } from '../hooks/useAudioCapture';
import { SpectrogramCanvas } from './SpectrogramCanvas';

const ESTADO_LABELS: Record<string, string> = {
  idle: 'Inactivo',
  solicitando_permiso: 'Solicitando permiso…',
  escuchando: 'Escuchando',
  pausado: 'Pausado',
  error: 'Error',
};

/**
 * Panel principal de captura acústica con control de un solo toque,
 * vúmetro de nivel, métricas en vivo y visualización del mel-espectrograma.
 */
export function AudioCapturePanel(): React.JSX.Element {
  const {
    estado,
    error,
    nivelRms,
    nivelPico,
    conteoVentanas,
    ultimoEspectrograma,
    latenciaUltimoEspectrogramaMs,
    sampleRate,
    iniciarEscucha,
    detenerEscucha,
  } = useAudioCapture();

  const escuchando = estado === 'escuchando';
  const procesando = estado === 'solicitando_permiso';

  const handleToggle = (): void => {
    if (escuchando) {
      void detenerEscucha();
    } else {
      void iniciarEscucha();
    }
  };

  return (
    <section aria-label="Panel de captura acústica" style={{ padding: '1rem' }}>
      {/* Banner de privacidad (RNF-08) */}
      <div
        role="note"
        style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '6px',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          color: '#065f46',
        }}
      >
        <strong>Privacidad:</strong> El audio se procesa íntegramente en tu
        dispositivo y no se transmite a ningún servidor. Solo los fragmentos de
        confianza intermedia pueden ser enviados a verificación, con tu
        autorización explícita.
      </div>

      {/* Botón principal de un solo toque (HU-01, RNF-10: área >= 48x48px) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={procesando}
          aria-label={escuchando ? 'Detener escucha' : 'Iniciar escucha'}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: 'none',
            cursor: procesando ? 'wait' : 'pointer',
            fontSize: '2rem',
            backgroundColor: escuchando ? '#dc2626' : '#059669',
            color: '#ffffff',
            boxShadow: escuchando
              ? '0 0 0 4px rgba(220, 38, 38, 0.3)'
              : '0 0 0 4px rgba(5, 150, 105, 0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          {escuchando ? '⏹' : '🎙'}
        </button>

        <span
          aria-live="polite"
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: escuchando ? '#dc2626' : '#374151',
          }}
        >
          {ESTADO_LABELS[estado] ?? estado}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '0.75rem',
            marginBottom: '1rem',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Vúmetro de nivel */}
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
        }}
      >
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
          Nivel de entrada
        </h2>

        <div style={{ marginBottom: '0.5rem' }}>
          <div
            style={{
              height: '12px',
              backgroundColor: '#e5e7eb',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <div
              role="meter"
              aria-label="Nivel RMS del micrófono"
              aria-valuenow={Math.round(nivelRms * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: '100%',
                width: `${String(Math.min(nivelRms * 100, 100))}%`,
                backgroundColor:
                  nivelRms > 0.8 ? '#dc2626' : nivelRms > 0.4 ? '#f59e0b' : '#059669',
                borderRadius: '6px',
                transition: 'width 0.1s ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
              color: '#6b7280',
              marginTop: '0.25rem',
            }}
          >
            <span>RMS: {(nivelRms * 100).toFixed(1)}%</span>
            <span>Pico: {(nivelPico * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Visualización del mel-espectrograma */}
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
        }}
      >
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
          Mel-espectrograma
        </h2>
        <SpectrogramCanvas espectrograma={ultimoEspectrograma} />
      </div>

      {/* Métricas técnicas en vivo */}
      <div
        style={{
          padding: '1rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '0.8125rem',
          color: '#4b5563',
        }}
      >
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>
          Métricas de sesión
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <span>Frecuencia de muestreo:</span>
          <span data-testid="sample-rate">{(sampleRate / 1000).toFixed(1)} kHz</span>

          <span>Ventanas procesadas:</span>
          <span data-testid="window-count">{conteoVentanas}</span>

          <span>Latencia del espectrograma:</span>
          <span data-testid="latency">{latenciaUltimoEspectrogramaMs} ms</span>
        </div>
      </div>
    </section>
  );
}
