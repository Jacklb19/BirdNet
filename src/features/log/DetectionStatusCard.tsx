import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import { useI18n } from '../../i18n';
import { formatConfidence } from './logFormat';
import { explanationFor, type LogRecord } from './logRecords';
import './DetectionStatusCard.css';

export interface DetectionStatusCardProps {
  readonly record: Pick<LogRecord, 'status' | 'confidence'>;
}

/** Verification state and confidence, in the state's color, with one sentence on what they mean. */
export function DetectionStatusCard({ record }: DetectionStatusCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const explanation = explanationFor(record);
  const texts = dict.log.detail.explanation;
  const confirmedFrom = formatConfidence(CONFIDENCE_THRESHOLDS.confirmedFrom, locale);
  let sentence: string;
  if (explanation.kind === 'confirmed') sentence = explanation.quotesThresholds ? texts.confirmed.range(confirmedFrom) : texts.confirmed.plain;
  else sentence = explanation.quotesThresholds ? texts.provisional.range(formatConfidence(CONFIDENCE_THRESHOLDS.discardBelow, locale), confirmedFrom) : texts.provisional.plain;
  return (
    <div className={`bn-log-status bn-log-status--${record.status}`}>
      <p className="bn-log-status__title">{[dict.common.status[record.status], formatConfidence(record.confidence, locale)].join(dict.common.separator)}</p>
      <p className="bn-log-status__text">{sentence}</p>
    </div>
  );
}
