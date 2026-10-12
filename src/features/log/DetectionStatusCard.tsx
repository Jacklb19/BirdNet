import { CONFIDENCE_THRESHOLDS } from '../../config/contract';
import { useI18n } from '../../i18n';
import { formatConfidence } from './logFormat';
import { displayStatus, explanationFor, type LogRecord } from './logRecords';
import './DetectionStatusCard.css';

export interface DetectionStatusCardProps {
  readonly record: Pick<LogRecord, 'status' | 'confidence' | 'review'>;
  /** Name of the species the model gave, for a record the person corrected. */
  readonly modelName?: string;
}

/**
 * Verification state and confidence, in the state's color, with one sentence on what they mean. Once the person
 * has given a verdict the card shows it instead, and the confidence is quoted only as what the model had said.
 */
export function DetectionStatusCard({ record, modelName }: DetectionStatusCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const explanation = explanationFor(record);
  const texts = dict.log.detail.explanation;
  const confirmedFrom = formatConfidence(CONFIDENCE_THRESHOLDS.confirmedFrom, locale);
  const shown = displayStatus(record);
  const reviewed = dict.log.detail.review.state;
  let sentence: string;
  if (shown === 'verified') sentence = reviewed.verified;
  else if (shown === 'corrected') sentence = reviewed.corrected(modelName ?? '', formatConfidence(record.confidence, locale));
  else if (shown === 'discarded') sentence = reviewed.discarded;
  else if (explanation.kind === 'confirmed') sentence = explanation.quotesThresholds ? texts.confirmed.range(confirmedFrom) : texts.confirmed.plain;
  else sentence = explanation.quotesThresholds ? texts.provisional.range(formatConfidence(CONFIDENCE_THRESHOLDS.discardBelow, locale), confirmedFrom) : texts.provisional.plain;
  return (
    <div className={`bn-log-status bn-log-status--${shown}`}>
      <p className="bn-log-status__title">
        {record.review ? dict.common.status[shown] : [dict.common.status[shown], formatConfidence(record.confidence, locale)].join(dict.common.separator)}
      </p>
      <p className="bn-log-status__text">{sentence}</p>
    </div>
  );
}
