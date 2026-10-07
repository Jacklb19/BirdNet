import { useId, useRef } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, formatNumber, useI18n } from '../../i18n';
import { ChorusClock } from '../../shared/ui/ChorusClock';
import { Icon } from '../../shared/ui/Icon';
import { SpeciesPhoto } from '../../shared/ui/SpeciesPhoto';
import type { CachedSite } from '../offline/types';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { CARD_PERIOD, CARD_PHOTO_COUNT, CARD_STATS_PRELOAD_MARGIN } from './sites.config';
import { cardChangeText, chartDescription, spokenChangeText } from './statsText';
import { speciesChange } from './siteText';
import { useNearViewport } from './useNearViewport';
import { useSiteStats } from './useSiteStats';
import './SiteCard.css';

export interface SiteCardProps {
  readonly site: CachedSite;
  readonly isActive: boolean;
  readonly online: boolean;
  /** An active-site change is being saved; every card's button waits for it. */
  readonly busy: boolean;
  readonly onSelect: (siteId: string | null) => void;
}

/**
 * One site: its chorus clock for the card period, visits, most heard species and the change in species.
 * The name is the link (stretched over the card), so the active-site button stays a separate control.
 * Offline, a card without loaded numbers shows only the saved name.
 */
export function SiteCard({ site, isActive, online, busy, onSelect }: SiteCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const names = useSpeciesNames();
  const nameId = useId();
  const ref = useRef<HTMLLIElement>(null);
  const near = useNearViewport(ref, CARD_STATS_PRELOAD_MARGIN);
  const { status, stats } = useSiteStats(site.id, CARD_PERIOD, online, near);
  const loading = !stats && status === 'loading';
  const failed = !stats && (status === 'error' || status === 'notFound');
  const change = stats ? speciesChange(stats.species_count, stats.previous_species_count) : null;
  const changeText = change && cardChangeText(change, CARD_PERIOD, t, locale);
  const changeSpoken = change && spokenChangeText(change, CARD_PERIOD, t, locale);
  const rising = change?.kind === 'change' && change.delta > 0;

  return (
    <li ref={ref} className={`bn-site-card${isActive ? ' bn-site-card--active' : ''}`}>
      <div className="bn-site-card__main">
        {stats ? (
          <ChorusClock variant="compact" className="bn-site-card__clock" hourly={stats.hourly} value={formatNumber(stats.species_count, locale)}
            description={chartDescription(stats, CARD_PERIOD, t, locale)} />
        ) : (
          <span className={`bn-site-card__clock bn-site-card__placeholder${loading ? ' bn-site-card__placeholder--loading' : ''}`} aria-hidden="true">
            {!loading && <Icon name="sites" />}
          </span>
        )}
        <div className="bn-site-card__body">
          <h2 id={nameId} className="bn-site-card__name">
            <a className="bn-site-card__link" href={routeHash({ name: 'site', id: site.id })}>{site.name}</a>
          </h2>
          {loading && (
            <p className="bn-site-card__meta">
              <span className="bn-site-card__skeleton" aria-hidden="true" />
              <span className="visually-hidden">{t.statsLoading}</span>
            </p>
          )}
          {failed && <p className="bn-site-card__meta">{t.statsUnavailable}</p>}
          {stats && (
            <>
              <p className="bn-site-card__meta">{formatCount(t.visits, stats.active_days, locale)}</p>
              {(stats.species.length > 0 || changeText) && (
                <div className="bn-site-card__species">
                  {stats.species.length > 0 && (
                    <ul className="bn-site-card__photos" aria-label={t.topSpecies}>
                      {stats.species.slice(0, CARD_PHOTO_COUNT).map(({ species }) => (
                        <li key={species}>
                          <SpeciesPhoto className="bn-site-card__photo" variant="round" scientificName={species} alt={commonName(names, species, locale)} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {changeText && (
                    <p className={`bn-site-card__change${rising ? ' bn-site-card__change--up' : ''}`}>
                      <span aria-hidden="true">{changeText}</span>
                      <span className="visually-hidden">{changeSpoken}</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <span className="bn-site-card__chevron"><Icon name="chevron" size="s" /></span>
      </div>
      <div className="bn-site-card__footer">
        {isActive && <p className="bn-site-card__active"><Icon name="check" size="s" /><span>{t.activeSite}</span></p>}
        {/* aria-disabled instead of disabled: a disabled button drops keyboard focus while the choice is saved. */}
        <button type="button" className="bn-site-card__action" aria-disabled={busy} aria-describedby={nameId}
          onClick={() => { if (!busy) onSelect(isActive ? null : site.id); }}>
          {isActive ? t.stopUsing : t.useAsActive}
        </button>
      </div>
    </li>
  );
}
