import { useI18n, formatPercent } from '../../i18n';
import { FieldIcon } from '../../shared/FieldIcon';
import type { ClassifiedDetection } from './detectionPolicy';

export interface DetectionsPanelProps {
  readonly detections: readonly ClassifiedDetection[];
}

/** Candidate readings remain explicitly indicative, including locally confirmed results. */
export function DetectionsPanel({ detections }: DetectionsPanelProps): React.JSX.Element {
  const { locale, dict } = useI18n();
  const labels = dict.inference;
  return (
    <section aria-label={labels.resultsTitle} className="detections-panel">
      <div className="section-heading"><h2>{labels.resultsTitle}</h2><FieldIcon name="bird" /></div>
      <p className="indicative-notice">{labels.indicativeNotice}</p>
      <div aria-live="polite" aria-atomic="true">
        {detections.length === 0 ? <div className="empty-detections"><FieldIcon name="signal" /><p>{labels.noDetections}</p></div> : (
          <ul className="detection-list">
            {detections.map((detection) => (
              <li key={detection.classIndex} data-status={detection.status}>
                <h3>{detection.commonName}</h3>
                <p className="scientific-name"><span className="visually-hidden">{labels.scientificName} </span><i>{detection.scientificName}</i></p>
                <div className="confidence-reading"><span>{labels.confidence}</span><strong>{detection.confidence >= 0.999
                  ? `≥ ${formatPercent(0.999, locale, 1)}` : formatPercent(detection.confidence, locale, 1)}</strong></div>
                <div className="confidence-track" aria-hidden="true"><span style={{ width: `${String(Math.min(detection.confidence, 0.999) * 100)}%` }} /></div>
                <p className="verification-label"><FieldIcon name={detection.status === 'confirmed_local' ? 'signal' : 'clock'} /><span><span className="visually-hidden">{labels.statusLabel} </span>{detection.status === 'confirmed_local' ? labels.confirmedLocal : labels.provisional}</span></p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="session-notice">{labels.sessionOnly}</p>
    </section>
  );
}
