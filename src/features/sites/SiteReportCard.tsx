import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '../../config/api';
import type { Period } from '../../config/contract';
import { formatDate, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { fetchReport, reportNames, writeReport, type SiteReport, type SiteStats } from './sitesApi';
import './SiteReportCard.css';

type Failure = 'quota' | 'unavailable';
type ReportState =
  | { readonly status: 'loading' | 'none' | 'writing' }
  | { readonly status: 'loaded'; readonly report: SiteReport }
  | { readonly status: 'failed'; readonly failure: Failure; readonly report: SiteReport | null };

const TOO_MANY = 429;
const DATE_ONLY: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: undefined };

export interface SiteReportCardProps {
  readonly siteId: string;
  readonly period: Period;
  readonly stats: SiteStats;
  readonly token: string;
  readonly online: boolean;
}

/**
 * The report of the site in plain words (RF-15), written by the language model only when the person asks, from the
 * figures this panel already shows. It always says who wrote it and from which figures.
 */
export function SiteReportCard({ siteId, period, stats, token, online }: SiteReportCardProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites.report;
  const names = useSpeciesNames();
  const headingId = useId();
  const key = `${siteId}|${period}|${locale}`;
  const [state, setState] = useState<{ readonly key: string; readonly value: ReportState } | null>(null);
  const current = state?.key === key ? state.value : { status: 'loading' as const };

  useEffect(() => {
    if (!online) return;
    let active = true;
    fetchReport(token, siteId, period, locale)
      .then((report) => { if (active) setState({ key, value: report ? { status: 'loaded', report } : { status: 'none' } }); })
      // Not being able to read a past report must not hide the button that writes one.
      .catch(() => { if (active) setState({ key, value: { status: 'none' } }); });
    return () => { active = false; };
  }, [token, siteId, period, locale, online, key]);

  const shown = current.status === 'loaded' || current.status === 'failed' ? current.report : null;
  const write = useCallback(() => {
    setState({ key, value: { status: 'writing' } });
    writeReport(token, siteId, period, locale, reportNames(stats, (species) => commonName(names, species, locale)))
      .then((report) => { setState({ key, value: { status: 'loaded', report } }); })
      .catch((error: unknown) => {
        const failure: Failure = error instanceof ApiError && error.status === TOO_MANY ? 'quota' : 'unavailable';
        setState({ key, value: { status: 'failed', failure, report: shown } });
      });
  }, [token, siteId, period, locale, stats, names, key, shown]);

  const heard = stats.detections > 0;
  const canWrite = online && heard && current.status !== 'writing' && current.status !== 'loading';
  const span = dict.sites.span[period];
  // The panel's caution right under this card says that silence is not absence; it is not repeated here.

  return (
    <section className="bn-site-report" aria-labelledby={headingId} aria-busy={current.status === 'writing'}>
      <div className="bn-site-report__head">
        <h2 id={headingId} className="bn-site-report__title">{t.title}</h2>
        {shown && <p className="bn-site-report__badge"><Icon name="generated" size="s" />{t.badge}</p>}
      </div>

      {current.status === 'writing' && <p className="bn-site-report__muted" role="status">{t.writing}</p>}
      {shown && (
        <>
          <div className="bn-site-report__text">
            {shown.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <p className="bn-site-report__muted">{t.from(formatDate(new Date(shown.generatedAt), locale, DATE_ONLY))}</p>
          {shown.stale && <p className="bn-site-report__muted">{t.stale}</p>}
        </>
      )}
      {!shown && current.status !== 'writing' && <p className="bn-site-report__muted">{heard ? t.intro : t.nothingHeard(span)}</p>}

      {current.status === 'failed' && <Notice tone={current.failure === 'quota' ? 'caution' : 'error'} live>{t.failures[current.failure]}</Notice>}
      {heard && (!shown || shown.stale) && (
        <div className="bn-site-report__actions">
          <Button variant={shown ? 'secondary' : 'primary'} icon="generated" disabled={!canWrite} onClick={write}>
            {shown ? t.rewrite : t.write}
          </Button>
          {!online && <p className="bn-site-report__muted">{t.needsConnection}</p>}
        </div>
      )}
      {!shown && heard && <p className="bn-site-report__muted">{t.howItIsWritten}</p>}
    </section>
  );
}
