import { useAudioCapture } from '../hooks/useAudioCapture';
import { SpectrogramCanvas } from './SpectrogramCanvas';
import { DetectionsPanel } from '../../inference/DetectionsPanel';
import { FieldIcon } from '../../../shared/FieldIcon';
import { useI18n, formatPercent, formatDecimal, formatNumber, formatMilliseconds } from '../../../i18n';

/** Field capture view with a thumb-accessible control and live acoustic readings. */
export function AudioCapturePanel(): React.JSX.Element {
  const { locale, dict } = useI18n();
  const {
    state, rmsLevel, peakLevel, windowCount, latestSpectrogram, spectrogramLatencyMs, sampleRate,
    startListening, stopListening, modelStatus, detections, inferenceLatencyMs, endToEndLatencyMs,
    droppedWindows, sessionError,
  } = useAudioCapture();
  const c = dict.capture;
  const f = dict.field;
  const statusLabels: Record<string, string> = {
    idle: c.statusIdle, requesting_permission: c.statusRequesting, listening: c.statusListening,
    paused: c.statusPaused, error: c.statusError,
  };
  const isListening = state === 'listening';
  const isStarting = state === 'requesting_permission' || modelStatus === 'loading';
  const canStop = isListening || modelStatus === 'loading';
  const statusLabel = sessionError ? c.statusError : modelStatus === 'loading'
    ? dict.inference.loadingModel : statusLabels[state] ?? state;
  const sessionErrorLabel = sessionError === 'model' ? dict.inference.modelError
    : sessionError === 'storage' ? dict.offline.storageError : sessionError === 'audio' ? dict.inference.audioError : dict.inference.processingError;
  const modelLabel = modelStatus === 'loading' ? dict.inference.loadingModel
    : modelStatus === 'ready' ? f.modelReady : sessionError === 'model' || modelStatus === 'error' ? c.statusError : f.modelPending;
  const handleToggle = (): void => {
    if (canStop) { void stopListening(); } else { void startListening(); }
  };

  return (
    <section aria-label={c.panelAria} className="page capture-page" data-listening={isListening} data-error={Boolean(sessionError)}>
      <header className="page-heading"><p className="eyebrow">{dict.app.navCapture}</p><h2>{f.fieldListening}</h2></header>
      <div className="capture-workspace">
        <section className="recorder" aria-label={f.fieldListening}>
          <div className="recorder-head">
            <div className="listening-copy">
              <span className="eyebrow">{f.sessionStatus}</span>
              <p className="listening-state" aria-live="polite"><FieldIcon name={sessionError ? 'error' : isListening ? 'signal' : isStarting ? 'download' : 'clock'} />{statusLabel}</p>
            </div>
            <div className="listening-control">
              <div className="control-copy"><span className="control-caption">{canStop ? c.stopListening : c.startListening}</span><span className="control-local"><FieldIcon name="shield" />{f.localProcessing}</span></div>
              <div className="listen-bezel">
                <button className="listen-button" type="button" onClick={handleToggle}
                  disabled={state === 'requesting_permission'} aria-label={canStop ? c.stopListening : c.startListening}
                  style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)' }}>
                  <FieldIcon name={canStop ? 'stop' : 'mic'} />
                </button>
              </div>
            </div>
          </div>
          {sessionError && <div role="alert" className="error-notice"><FieldIcon name="error" /><p>{sessionErrorLabel}</p></div>}
          <section className="signal-panel" aria-label={c.melSpectrogram}>
            <div className="section-heading"><h2>{c.melSpectrogram}</h2><span className="technical-label">{formatDecimal(3, locale, 1)} s</span></div>
            <SpectrogramCanvas espectrograma={latestSpectrogram} />
            <div className="level-panel">
              <div className="section-heading"><h2>{c.inputLevel}</h2><span className="technical-label">{c.peakLabel} {formatPercent(peakLevel, locale, 1)}</span></div>
              <div className="level-track" role="meter" aria-label={c.rmsAria}
                aria-valuenow={Math.round(rmsLevel * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="level-fill" data-level={rmsLevel > 0.8 ? 'high' : rmsLevel > 0.4 ? 'medium' : 'low'} style={{ width: `${String(Math.min(rmsLevel * 100, 100))}%` }} />
                <span className="peak-marker" style={{ left: `${String(Math.min(peakLevel * 100, 100))}%` }} />
              </div>
              <div className="meter-scale"><span>{formatPercent(0, locale, 0)}</span><strong>{c.rmsLabel} {formatPercent(rmsLevel, locale, 1)}</strong><span>{formatPercent(1, locale, 0)}</span></div>
            </div>
          </section>
          <section className="model-state" aria-label={dict.modelDownload.title} data-status={sessionError === 'model' ? 'error' : modelStatus}>
            <FieldIcon name={sessionError === 'model' || modelStatus === 'error' ? 'error' : modelStatus === 'ready' ? 'ready' : 'download'} />
            <div><h2>{dict.modelDownload.title}</h2><p>{dict.inference.downloadNotice}</p></div>
            <span className="model-label" role="status">{modelLabel}</span>
            {modelStatus === 'loading' && <progress aria-label={dict.inference.loadingModel} />}
          </section>
        </section>
        <DetectionsPanel detections={detections} />
      </div>
      <div className="capture-footnotes">
        <details className="privacy-notice"><summary><FieldIcon name="shield" />{dict.privacy.title} {f.localProcessing}</summary><p>{dict.privacy.description}</p></details>
        <details className="session-metrics">
          <summary>{c.sessionMetrics}</summary>
          <dl>
            <div><dt>{c.sampleRate}</dt><dd data-testid="sample-rate">{formatDecimal(sampleRate / 1000, locale, 1)} kHz</dd></div>
            <div><dt>{c.windowsCount}</dt><dd data-testid="window-count">{formatNumber(windowCount, locale)}</dd></div>
            <div><dt>{c.spectrogramLatency}</dt><dd data-testid="latency">{formatMilliseconds(spectrogramLatencyMs, locale, 0)}</dd></div>
            <div><dt>{dict.inference.inferenceLatency}</dt><dd data-testid="inference-latency">{formatMilliseconds(inferenceLatencyMs, locale, 0)}</dd></div>
            <div><dt>{dict.inference.endToEndLatency}</dt><dd data-testid="end-to-end-latency">{formatMilliseconds(endToEndLatencyMs, locale, 0)}</dd></div>
            <div><dt>{dict.inference.droppedWindows}</dt><dd data-testid="dropped-windows">{formatNumber(droppedWindows, locale)}</dd></div>
          </dl>
        </details>
      </div>
    </section>
  );
}
