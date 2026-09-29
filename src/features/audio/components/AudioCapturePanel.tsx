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
    <section aria-label="Panel de captura acústica" style={{ padding: 'var(--spacing-4)' }}>
      {/* Banner de privacidad (RNF-08) */}
      <div
        role="note"
        style={{
          backgroundColor: 'var(--color-success-bg)',
          border: '1px solid var(--color-success-border)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-3) var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
          fontSize: 'var(--font-size-base)',
          color: 'var(--color-success-text)',
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
          gap: 'var(--spacing-4)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={procesando}
          aria-label={escuchando ? 'Detener escucha' : 'Iniciar escucha'}
          style={{
            width: 'var(--touch-target-size)',
            height: 'var(--touch-target-size)',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            cursor: procesando ? 'wait' : 'pointer',
            fontSize: 'var(--font-size-hero)',
            backgroundColor: escuchando ? 'var(--color-danger)' : 'var(--color-primary)',
            color: 'var(--color-primary-text)',
            boxShadow: escuchando
              ? '0 0 0 4px var(--color-danger-ring)'
              : '0 0 0 4px var(--color-primary-ring)',
            transition: 'all 0.2s ease',
          }}
        >
          {escuchando ? '⏹' : '🎙'}
        </button>

        <span
          aria-live="polite"
          style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-semibold)',
            color: escuchando ? 'var(--color-danger)' : 'var(--color-text-secondary)',
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
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-4)',
            color: 'var(--color-error-text)',
            fontSize: 'var(--font-size-base)',
          }}
        >
          {error}
        </div>
      )}

      {/* Vúmetro de nivel */}
      <div
        style={{
          marginBottom: 'var(--spacing-6)',
          padding: 'var(--spacing-4)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--font-size-md)',
            marginBottom: 'var(--spacing-3)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Nivel de entrada
        </h2>

        <div style={{ marginBottom: 'var(--spacing-2)' }}>
          <div
            style={{
              height: '12px',
              backgroundColor: 'var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
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
                  nivelRms > 0.8
                    ? 'var(--color-danger)'
                    : nivelRms > 0.4
                      ? 'var(--color-warning)'
                      : 'var(--color-primary)',
                borderRadius: 'var(--radius-md)',
                transition: 'width 0.1s ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-subtle)',
              marginTop: 'var(--spacing-1)',
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
          marginBottom: 'var(--spacing-6)',
          padding: 'var(--spacing-4)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--font-size-md)',
            marginBottom: 'var(--spacing-3)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Mel-espectrograma
        </h2>
        <SpectrogramCanvas espectrograma={ultimoEspectrograma} />
      </div>

      {/* Métricas técnicas en vivo */}
      <div
        style={{
          padding: 'var(--spacing-4)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--font-size-md)',
            marginBottom: 'var(--spacing-3)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Métricas de sesión
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-2)' }}>
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
