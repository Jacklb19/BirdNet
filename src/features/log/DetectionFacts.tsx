import { APPROX_CELL_METERS } from '../../config/contract';
import { formatMeters, useI18n } from '../../i18n';
import type { CachedSite } from '../offline/types';
import { formatDayTime, formatTime } from './logFormat';
import { placeOf, relativeDay, type LogRecord } from './logRecords';
import './DetectionFacts.css';

export interface DetectionFactsProps {
  readonly record: LogRecord;
  readonly sites: readonly CachedSite[];
  readonly online: boolean;
  /** Reference for "today" and "yesterday". */
  readonly now: Date;
}

/** When, where (only ever the approximate cell) and how far the record got on its way to the cloud. */
export function DetectionFacts({ record, sites, online, now }: DetectionFactsProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.log.detail;
  const time = formatTime(record.recordedAt, locale);
  const relative = relativeDay(record.recordedAt, now);
  const when = relative === 'other' ? formatDayTime(record.recordedAt, now, locale) : texts.when[relative](time);

  const cell = formatMeters(APPROX_CELL_METERS, locale);
  const place = placeOf(record, sites);
  const where = place.kind === 'site' ? texts.where.site(place.name, cell) : place.kind === 'cell' ? texts.where.cell(cell) : texts.where.none;

  const waiting = online ? texts.upload.waitingOnline : texts.upload.waitingOffline;
  const upload = record.upload === 'cloud' ? texts.upload.cloud : record.upload === 'waiting' ? waiting : texts.upload.phoneOnly;
  const reason = record.upload === 'cloud' || record.upload === 'waiting' ? null : texts.uploadReason[record.upload];

  return (
    <dl className="bn-log-facts">
      <div className="bn-log-facts__row">
        <dt className="bn-log-facts__term">{texts.facts.when}</dt>
        <dd className="bn-log-facts__value">{when}</dd>
      </div>
      <div className="bn-log-facts__row">
        <dt className="bn-log-facts__term">{texts.facts.where}</dt>
        <dd className="bn-log-facts__value">{where}</dd>
      </div>
      <div className="bn-log-facts__row">
        <dt className="bn-log-facts__term">{texts.facts.upload}</dt>
        <dd className="bn-log-facts__value">
          {upload}
          {reason && <span className="bn-log-facts__note">{reason}</span>}
        </dd>
      </div>
    </dl>
  );
}
