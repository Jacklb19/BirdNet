import { memo, useId, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { commonName, type useSpeciesNames } from '../species/speciesNames';
import { formatDayHeading } from './logFormat';
import { groupBySpecies, type DayGroup } from './logRecords';
import { LogSpeciesGroup } from './LogSpeciesGroup';
import './LogDay.css';

type SpeciesNames = ReturnType<typeof useSpeciesNames>;

export interface LogDayProps {
  readonly group: DayGroup;
  readonly names: SpeciesNames;
  /** Moment the records were read; the year is shown only for days of another year. */
  readonly now: Date;
}

/**
 * One local day of the log: "Today"/"Yesterday" with the date beside it, or the date alone, then its records
 * gathered by species.
 * Memoized: the page re-renders after every queue change (each song saved while listening), and unchanged days
 * need not re-render their rows.
 */
export const LogDay = memo(function LogDay({ group, names, now }: LogDayProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const headingId = useId();
  const date = formatDayHeading(group.day, now, locale);
  const label = group.relative === 'other' ? date : dict.log.days[group.relative];
  const species = useMemo(() => groupBySpecies(group.records), [group.records]);
  return (
    <section className="bn-log-day" aria-labelledby={headingId}>
      <h2 id={headingId} className="bn-log-day__title">
        <span className="bn-log-day__label">{label}</span>
        {/* Keeps the two parts apart in the heading's accessible name; layout ignores it. */}
        {group.relative !== 'other' && <>{' '}<span className="bn-log-day__date">{date}</span></>}
      </h2>
      <ul className="bn-log-day__list">
        {species.map((entry) => (
          <li key={entry.species}><LogSpeciesGroup group={entry} name={commonName(names, entry.species, locale)} /></li>
        ))}
      </ul>
    </section>
  );
});
