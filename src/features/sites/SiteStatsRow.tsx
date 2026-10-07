import type { Period } from '../../config/contract';
import { formatNumber, selectPlural, useI18n } from '../../i18n';
import type { SiteStats } from './sitesApi';
import { formatSigned, speciesChange } from './siteText';
import './SiteStatsRow.css';

/** Species (with the change against the previous period), songs and visits of the period. */
export function SiteStatsRow({ stats, period }: { readonly stats: SiteStats; readonly period: Period }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const change = speciesChange(stats.species_count, stats.previous_species_count);
  const previous = t.previousSpan[period];
  const items = [
    { key: 'species', value: stats.species_count, unit: t.speciesUnit },
    { key: 'songs', value: stats.detections, unit: t.songsUnit },
    { key: 'visits', value: stats.active_days, unit: t.visitsUnit },
  ] as const;
  return (
    <ul className="bn-site-stats" aria-label={t.summaryLabel}>
      {items.map((item) => (
        <li key={item.key} className="bn-site-stats__item">
          <span className="bn-site-stats__value">{formatNumber(item.value, locale)}</span>
          <span className="bn-site-stats__label">{selectPlural(item.unit, item.value, locale)}</span>
          {item.key === 'species' && change.kind === 'change' && (
            <span className={`bn-site-stats__delta${change.delta > 0 ? ' bn-site-stats__delta--up' : ''}`}>
              {t.change(formatSigned(change.delta, locale), previous)}
            </span>
          )}
          {item.key === 'species' && change.kind === 'same' && <span className="bn-site-stats__delta">{t.sameAsPrevious(previous)}</span>}
        </li>
      ))}
    </ul>
  );
}
