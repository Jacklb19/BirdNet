import { useAudioCapture } from '../hooks/useAudioCapture';
import { SpectrogramCanvas } from './SpectrogramCanvas';
import {
  useI18n,
  formatPercent,
  formatDecimal,
  formatNumber,
  formatMilliseconds,
} from '../../../i18n';

/**
 * Main acoustic capture panel with one-touch toggle control,
 * real-time VU meter, session metrics, and live mel-spectrogram canvas.
 */
export function AudioCapturePanel(): React.JSX.Element {
  const { locale, dict } = useI18n();
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

  const c = dict.capture;
  const p = dict.privacy;

  const statusLabels: Record<string, string> = {
    idle: c.statusIdle,
    solicitando_permiso: c.statusRequesting,
    escuchando: c.statusListening,
    pausado: c.statusPaused,
    error: c.statusError,
  };

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
    <section aria-label={c.panelAria} style={{ padding: 'var(--spacing-4)' }}>
      {/* Privacy banner (RNF-08) */}
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
        <strong>{p.title}</strong> {p.description}
      </div>

      {/* Main one-touch toggle button (HU-01, RNF-10: area >= 48x48px, target 80x80px) */}
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
          aria-label={escuchando ? c.stopListening : c.startListening}
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
          {statusLabels[estado] ?? estado}
        </span>
      </div>

      {/* Error display */}
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

      {/* Input level meter */}
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
          {c.inputLevel}
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
              aria-label={c.rmsAria}
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
            <span>{c.rmsLabel} {formatPercent(nivelRms, locale, 1)}</span>
            <span>{c.peakLabel} {formatPercent(nivelPico, locale, 1)}</span>
          </div>
        </div>
      </div>

      {/* Mel-spectrogram live canvas */}
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
          {c.melSpectrogram}
        </h2>
        <SpectrogramCanvas espectrograma={ultimoEspectrograma} />
      </div>

      {/* Session metrics */}
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
          {c.sessionMetrics}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-2)' }}>
          <span>{c.sampleRate}</span>
          <span data-testid="sample-rate">{formatDecimal(sampleRate / 1000, locale, 1)} kHz</span>

          <span>{c.windowsCount}</span>
          <span data-testid="window-count">{formatNumber(conteoVentanas, locale)}</span>

          <span>{c.spectrogramLatency}</span>
          <span data-testid="latency">{formatMilliseconds(latenciaUltimoEspectrogramaMs, locale, 0)}</span>
        </div>
      </div>
    </section>
  );
}
