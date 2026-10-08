import { memo, useId } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { commonName, type useSpeciesNames } from '../species/speciesNames';
import { formatConfidence, formatDayHeading, formatTime } from './logFormat';
import type { DayGroup } from './logRecords';
import './LogDay.css';

type SpeciesNames = ReturnType<typeof useSpeciesNames>;

export interface LogDayProps {
  readonly group: DayGroup;
  readonly names: SpeciesNames;
  /** Moment the records were read; the year is shown only for days of another year. */
  readonly now: Date;
}

/**
 * One local day of the log: "Today"/"Yesterday" with the date beside it, or the date alone, then its records.
 * Memoized: the page re-renders after every queue change (each song saved while listening), and unchanged days
 * need not re-render their rows.
 */
export const LogDay = memo(function LogDay({ group, names, now }: LogDayProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const headingId = useId();
  const date = formatDayHeading(group.day, now, locale);
  const label = group.relative === 'other' ? date : dict.log.days[group.relative];
  return (
    <section className="bn-log-day" aria-labelledby={headingId}>
      <h2 id={headingId} className="bn-log-day__title">
        <span className="bn-log-day__label">{label}</span>
        {/* Keeps the two parts apart in the heading's accessible name; layout ignores it. */}
        {group.relative !== 'other' && <>{' '}<span className="bn-log-day__date">{date}</span></>}
      </h2>
      <ul className="bn-log-day__list">
        {group.records.map((record) => {
          const name = commonName(names, record.species, locale);
          const time = formatTime(record.recordedAt, locale);
          const confidence = formatConfidence(record.confidence, locale);
          return (
            <li key={record.id}>
              <SpeciesRow href={routeHash({ name: 'detection', id: record.id })} scientificName={record.species} name={name}
                status={dict.common.status[record.status]} tone={record.status} detail={[time, confidence].join(dict.common.separator)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
});
