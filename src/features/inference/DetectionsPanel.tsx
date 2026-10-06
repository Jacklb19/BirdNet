import { useI18n, formatPercent } from '../../i18n';
import type { ClassifiedDetection } from './detectionPolicy';

export interface DetectionsPanelProps {
  readonly detections: readonly ClassifiedDetection[];
}

/** Displays only accepted candidates, with confidence and explicit verification state. */
export function DetectionsPanel({ detections }: DetectionsPanelProps): React.JSX.Element {
  const { locale, dict } = useI18n();
  const labels = dict.inference;
  return (
    <section aria-label={labels.resultsTitle} className="detections-panel">
      <h2>{labels.resultsTitle}</h2>
      <p>{labels.indicativeNotice}</p>
      <div aria-live="polite" aria-atomic="true">
        {detections.length === 0 ? <p>{labels.noDetections}</p> : (
          <ul className="detection-list">
            {detections.map((detection) => (
              <li key={detection.classIndex}>
                <p><strong>{labels.scientificName}</strong> <i>{detection.scientificName}</i></p>
                <p>{labels.commonName} {detection.commonName}</p>
                <p>{labels.confidence} {detection.confidence >= 0.999
                  ? `≥ ${formatPercent(0.999, locale, 1)}`
                  : formatPercent(detection.confidence, locale, 1)}</p>
                <p><strong>{labels.statusLabel}</strong> {detection.status === 'confirmed_local'
                  ? labels.confirmedLocal : labels.provisional}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p>{labels.sessionOnly}</p>
    </section>
  );
}
