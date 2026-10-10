import { useMemo } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, formatDistance, formatNumber, useI18n } from '../../i18n';
import { Icon } from '../../shared/ui/Icon';
import { Sticker } from '../../shared/ui/Sticker';
import { formatClock } from '../../shared/time';
import type { StoredWalk } from '../offline/types';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { LOG_NEW_SPECIES_SHOWN, LOG_WALKS_SHOWN } from './log.config';
import { formatDayTime, formatTime } from './logFormat';
import { logInsights, walkSummaries } from './logInsights';
import type { LogRecord } from './logRecords';
import './LogSummary.css';

export interface LogSummaryProps {
  readonly records: readonly LogRecord[];
  readonly walks: readonly StoredWalk[];
  /** When the records were read; "this week" is relative to it. */
  readonly now: Date;
}

/**
 * The log at a glance, above its day-by-day list: what has been heard in all, the birds that are new this week,
 * the hour with most songs, and the latest walks. Every figure is counted from the records on this phone.
 */
export function LogSummary({ records, walks, now }: LogSummaryProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.log.summary;
  const names = useSpeciesNames();
  const insights = useMemo(() => logInsights(records, now.getTime()), [records, now]);
  const latestWalks = useMemo(() => walkSummaries(walks, records).slice(0, LOG_WALKS_SHOWN), [walks, records]);
  const fresh = insights.newSpecies.slice(0, LOG_NEW_SPECIES_SHOWN);
  const busiest = insights.busiestHour === null ? null
    : formatTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), insights.busiestHour).getTime(), locale);

  return (
    <section className="bn-log-summary" aria-label={t.label}>
      <dl className="bn-log-summary__figures">
        <div><dt className="label">{t.species}</dt><dd className="display">{formatNumber(insights.species, locale)}</dd></div>
        <div><dt className="label">{t.songs}</dt><dd className="display">{formatNumber(insights.songs, locale)}</dd></div>
        <div><dt className="label">{t.newThisWeek}</dt><dd className="display">{formatNumber(insights.newSpecies.length, locale)}</dd></div>
        {busiest && <div><dt className="label">{t.busiestHour}</dt><dd className="display">{busiest}</dd></div>}
      </dl>
      {fresh.length > 0 && (
        <div className="bn-log-summary__block">
          <h2 className="label bn-log-summary__heading">{t.newTitle}</h2>
          <ul className="bn-log-summary__new">
            {fresh.map((species, index) => (
              <li key={species}>
                <a className="bn-log-summary__bird" href={routeHash({ name: 'species', species })}>
                  <Sticker scientificName={species} alt="" size="xs" drop order={index} />
                  <span>{commonName(names, species, locale)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {latestWalks.length > 0 && (
        <div className="bn-log-summary__block">
          <h2 className="label bn-log-summary__heading">{t.walksTitle}</h2>
          <ul className="bn-log-summary__walks">
            {latestWalks.map((walk) => (
              <li key={walk.id}>
                <a className="bn-log-summary__walk" href={routeHash({ name: 'map' })}>
                  <span className="bn-log-summary__walk-icon" aria-hidden="true"><Icon name="walk" size="s" /></span>
                  <span className="bn-log-summary__walk-text">
                    <span className="bn-log-summary__walk-when">{formatDayTime(walk.startedAt, now, locale)}</span>
                    <span className="bn-log-summary__walk-detail">
                      {t.walkDetail(
                        formatDistance(walk.meters, locale),
                        walk.durationMs === null ? t.walkInterrupted : formatClock(walk.durationMs),
                        formatCount(dict.log.today.species, walk.species, locale),
                      )}
                    </span>
                  </span>
                  <Icon name="chevron" size="s" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
