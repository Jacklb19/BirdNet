import { useId } from 'react';
import type { Period } from '../../config/contract';
import { formatNumber, selectPlural, useI18n } from '../../i18n';
import { ChorusClock } from '../../shared/ui/ChorusClock';
import type { SiteStats } from './sitesApi';
import { chartDescription, peakSentence } from './statsText';
import './SiteChorusCard.css';

/** "When this site sings": the hourly chorus of the period, with the species count inside and the peak hour below. */
export function SiteChorusCard({ stats, period }: { readonly stats: SiteStats; readonly period: Period }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const titleId = useId();
  return (
    <section className="bn-site-chorus" aria-labelledby={titleId}>
      {/* The heading comes first for screen readers; the clock is drawn above it, as in the design. */}
      <div className="bn-site-chorus__text">
        <h2 id={titleId} className="bn-site-chorus__title">{t.chorusTitle}</h2>
        <p className="bn-site-chorus__caption">{t.chorusCaption(t.span[period], peakSentence(stats, t, locale))}</p>
      </div>
      <ChorusClock className="bn-site-chorus__clock" hourly={stats.hourly} value={formatNumber(stats.species_count, locale)}
        unit={selectPlural(t.speciesUnit, stats.species_count, locale)} description={chartDescription(stats, period, t, locale)} />
    </section>
  );
}
