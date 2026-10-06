import { useAudioCapture } from '../hooks/useAudioCapture';
import { SpectrogramCanvas } from './SpectrogramCanvas';
import { DetectionsPanel } from '../../inference/DetectionsPanel';
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
    state,
    rmsLevel,
    peakLevel,
    windowCount,
    latestSpectrogram,
    spectrogramLatencyMs,
    sampleRate,
    startListening,
    stopListening,
    modelStatus,
    detections,
    inferenceLatencyMs,
    endToEndLatencyMs,
    droppedWindows,
    sessionError,
  } = useAudioCapture();

  const c = dict.capture;
  const p = dict.privacy;

  const statusLabels: Record<string, string> = {
    idle: c.statusIdle,
    requesting_permission: c.statusRequesting,
    listening: c.statusListening,
    paused: c.statusPaused,
    error: c.statusError,
  };

  const isListening = state === 'listening';
  const isStarting = state === 'requesting_permission' || modelStatus === 'loading';
  const sessionErrorLabel = sessionError === 'model' ? dict.inference.modelError
    : sessionError === 'audio' ? dict.inference.audioError : dict.inference.processingError;

  const handleToggle = (): void => {
    if (isListening || modelStatus === 'loading') {
      void stopListening();
    } else {
      void startListening();
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

      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-4)', fontSize: 'var(--font-size-base)' }}>
        {dict.inference.downloadNotice}
      </p>

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
          disabled={state === 'requesting_permission'}
          aria-label={isListening || modelStatus === 'loading' ? c.stopListening : c.startListening}
          style={{
            width: 'var(--touch-target-size)',
            height: 'var(--touch-target-size)',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            cursor: isStarting ? 'wait' : 'pointer',
            fontSize: 'var(--font-size-hero)',
            backgroundColor: isListening ? 'var(--color-danger)' : 'var(--color-primary)',
            color: 'var(--color-primary-text)',
            boxShadow: isListening
              ? '0 0 0 4px var(--color-danger-ring)'
              : '0 0 0 4px var(--color-primary-ring)',
            transition: 'all 0.2s ease',
          }}
        >
          {isListening || modelStatus === 'loading' ? '⏹' : '🎙'}
        </button>

        <span
          aria-live="polite"
          style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-semibold)',
            color: isListening ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}
        >
          {sessionError ? c.statusError : modelStatus === 'loading' ? dict.inference.loadingModel : statusLabels[state] ?? state}
        </span>
      </div>

      {/* Error display */}
      {sessionError && (
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
          {sessionErrorLabel}
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
              aria-valuenow={Math.round(rmsLevel * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                height: '100%',
                width: `${String(Math.min(rmsLevel * 100, 100))}%`,
                backgroundColor:
                  rmsLevel > 0.8
                    ? 'var(--color-danger)'
                    : rmsLevel > 0.4
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
            <span>{c.rmsLabel} {formatPercent(rmsLevel, locale, 1)}</span>
            <span>{c.peakLabel} {formatPercent(peakLevel, locale, 1)}</span>
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
        <SpectrogramCanvas espectrograma={latestSpectrogram} />
      </div>

      <DetectionsPanel detections={detections} />

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
          <span data-testid="window-count">{formatNumber(windowCount, locale)}</span>

          <span>{c.spectrogramLatency}</span>
          <span data-testid="latency">{formatMilliseconds(spectrogramLatencyMs, locale, 0)}</span>

          <span>{dict.inference.inferenceLatency}</span>
          <span data-testid="inference-latency">{formatMilliseconds(inferenceLatencyMs, locale, 0)}</span>
          <span>{dict.inference.endToEndLatency}</span>
          <span data-testid="end-to-end-latency">{formatMilliseconds(endToEndLatencyMs, locale, 0)}</span>
          <span>{dict.inference.droppedWindows}</span>
          <span data-testid="dropped-windows">{formatNumber(droppedWindows, locale)}</span>
        </div>
      </div>
    </section>
  );
}
