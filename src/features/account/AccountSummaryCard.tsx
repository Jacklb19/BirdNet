import { useId } from 'react';
import { routeHash } from '../../app/routes';
import { formatDate, formatNumber, selectPlural, useI18n, type PluralForms } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import type { SummaryState } from './useAccountSummary';
import './LocalStatsCard.css';

/** What the account has contributed across every device (the cloud record), with the way into the album. */
export function AccountSummaryCard({ state }: { readonly state: SummaryState }): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const texts = dict.account.summary;
  const titleId = useId();
  if (state.status === 'idle') return null;
  const summary = state.status === 'ready' ? state.summary : null;
  const items: readonly { readonly key: string; readonly count: number; readonly label: PluralForms<string> }[] = summary
    ? [
        { key: 'species', count: summary.species, label: texts.species },
        { key: 'songs', count: summary.detections, label: texts.songs },
        { key: 'days', count: summary.activeDays, label: texts.days },
        { key: 'sites', count: summary.sites, label: texts.sites },
      ]
    : [];
  return (
    <section className="bn-account-stats" aria-labelledby={titleId}>
      <h2 id={titleId} className="bn-account-stats__title">{texts.title}</h2>
      <div className="bn-account-stats__card bn-account-stats__card--summary">
        {state.status === 'loading' && <p className="bn-account-stats__message">{dict.common.loading}</p>}
        {state.status === 'unavailable' && <p className="bn-account-stats__message">{texts.unavailable}</p>}
        {summary && (
          <>
            <dl className="bn-account-stats__grid bn-account-stats__grid--four">
              {items.map((item) => (
                <div key={item.key} className="bn-account-stats__item">
                  <dt className="bn-account-stats__label">{selectPlural(item.label, item.count, locale)}</dt>
                  <dd className="bn-account-stats__value">{formatNumber(item.count, locale)}</dd>
                </div>
              ))}
            </dl>
            {summary.firstRecordedAt && (
              <p className="bn-account-stats__message">{texts.since(formatDate(new Date(summary.firstRecordedAt), locale))}</p>
            )}
          </>
        )}
        <Button variant="accent" icon="album" href={routeHash({ name: 'album' })}>{texts.album}</Button>
      </div>
    </section>
  );
}
