import { useId, useState } from 'react';
import type { Period } from '../../config/contract';
import { formatCount, formatDate, formatNumber, useI18n } from '../../i18n';
import { SpeciesRow } from '../../shared/ui/SpeciesRow';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { SPECIES_PREVIEW_COUNT } from './sites.config';
import type { SiteStats, SpeciesStat } from './sitesApi';
import { firstSeenFormat, previewSpecies, visitsShare } from './siteText';
import './SiteSpeciesList.css';

/** Species heard in the period, most heard first; species heard here for the first time are marked as new. */
export function SiteSpeciesList({ stats, period }: { readonly stats: SiteStats; readonly period: Period }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const names = useSpeciesNames();
  const uid = useId();
  const [expanded, setExpanded] = useState(false);
  const { visible, hidden } = previewSpecies(stats.species, expanded, SPECIES_PREVIEW_COUNT);
  const until = new Date(stats.until);
  const ids = { title: `${uid}-title`, list: `${uid}-list` };

  const visits = (entry: SpeciesStat): string => {
    const share = visitsShare(entry.days, stats.active_days);
    if (share.kind === 'only') return t.onlyVisit;
    if (share.kind === 'all') return t.everyVisit;
    return t.someVisits(formatNumber(share.days, locale), formatNumber(share.total, locale));
  };

  return (
    <section className="bn-site-species" aria-labelledby={ids.title}>
      <div className="bn-site-species__head">
        <div className="bn-site-species__heading">
          <h2 id={ids.title} className="bn-site-species__title">{t.speciesTitle[period]}</h2>
          {/* Statistics count every detection that was not discarded, so the list is honest about unverified ones. */}
          {stats.species.length > 0 && <p className="bn-site-species__note">{t.includesProvisional}</p>}
        </div>
        {(hidden > 0 || expanded) && (
          <button type="button" className="bn-site-species__toggle" aria-expanded={expanded} aria-controls={ids.list}
            onClick={() => { setExpanded((value) => !value); }}>
            {expanded ? t.showFewer : t.showAll(formatNumber(stats.species.length, locale))}
          </button>
        )}
      </div>
      {stats.species.length === 0 ? (
        <p className="bn-site-species__empty">{t.noSpecies(t.span[period])}</p>
      ) : (
        <ul id={ids.list} className="bn-site-species__list">
          {visible.map((entry) => {
            const name = commonName(names, entry.species, locale);
            const firstSeen = new Date(entry.first_seen);
            return (
              <li key={entry.species}>
                {entry.is_new ? (
                  <SpeciesRow scientificName={entry.species} name={name} tone="brand" status={t.newSpecies}
                    detail={t.firstSeen(formatDate(firstSeen, locale, firstSeenFormat(firstSeen, until)))} />
                ) : (
                  <SpeciesRow scientificName={entry.species} name={name} tone="neutral"
                    status={formatCount(t.songs, entry.detections, locale)} detail={visits(entry)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
