import { useId } from 'react';
import { formatNumber, selectPlural, useI18n, type PluralForms } from '../../i18n';
import type { LocalTotals } from './localTotals';
import './LocalStatsCard.css';

export interface LocalStatsCardProps {
  /** Null while the local stores are being read. */
  readonly totals: LocalTotals | null;
  readonly siteCount: number;
  readonly error: boolean;
}

/** Totals of what this phone holds; labelled as such, since other devices of the same account are not counted. */
export function LocalStatsCard({ totals, siteCount, error }: LocalStatsCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.stats;
  const titleId = useId();
  const items: readonly { readonly key: string; readonly count: number; readonly label: PluralForms<string> }[] = totals
    ? [
        { key: 'songs', count: totals.songs, label: texts.songs },
        { key: 'species', count: totals.species, label: texts.species },
        { key: 'sites', count: siteCount, label: texts.sites },
      ]
    : [];

  return (
    <section className="bn-account-stats" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-account-stats__title">{texts.title}</h2>
      <div className="bn-account-stats__card">
        {error ? <p className="bn-account-stats__message">{texts.error}</p>
          : !totals ? <p className="bn-account-stats__message">{dict.common.loading}</p>
          : (
            <dl className="bn-account-stats__grid">
              {items.map((item) => {
                return (
                  <div key={item.key} className="bn-account-stats__item">
                    <dt className="bn-account-stats__label">{selectPlural(item.label, item.count, locale)}</dt>
                    <dd className="bn-account-stats__value">{formatNumber(item.count, locale)}</dd>
                  </div>
                );
              })}
            </dl>
          )}
      </div>
    </section>
  );
}
