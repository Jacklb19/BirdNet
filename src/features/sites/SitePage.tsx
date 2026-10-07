import { useEffect, useId, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useIsDesktop } from '../../config/layout';
import { APPROX_CELL_METERS, DEFAULT_PERIOD, PERIODS, type Period } from '../../config/contract';
import { formatCount, formatMeters, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Segmented } from '../../shared/ui/Segmented';
import { useAccountContext } from '../account/accountContext';
import { useOnline } from '../offline/useQueueStatus';
import { MissingSpecies } from './MissingSpecies';
import { SiteChorusCard } from './SiteChorusCard';
import { SitesAccessState } from './SitesAccessState';
import { SiteSpeciesList } from './SiteSpeciesList';
import { SiteStatsRow } from './SiteStatsRow';
import { useCsvExport } from './useCsvExport';
import { useSites } from './useSites';
import { useSiteStats } from './useSiteStats';
import './SitePage.css';

/** Panel of one site: chorus clock, period summary, species heard and not heard, and the CSV export. */
export default function SitePage({ id }: { readonly id: string }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.sites;
  const { configured, session } = useAccountContext();
  const online = useOnline();
  const isDesktop = useIsDesktop();
  const { sites, ready, refresh } = useSites();
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const token = session?.access_token ?? null;
  const site = sites.find((entry) => entry.id === id) ?? null;
  const { status, stats, retry } = useSiteStats(id, period, online);
  const csv = useCsvExport(id, site?.name ?? '', period, token);
  const exportWhyId = useId();
  const known = site !== null;

  // A site opened from a link may be missing from the saved list (created on another device): fetch the list once.
  useEffect(() => {
    if (ready && !known) void refresh();
  }, [ready, known, refresh]);

  const back = { href: routeHash({ name: 'sites' }), label: t.title };
  const title = site?.name ?? t.siteFallbackTitle;

  if (!configured || !session) {
    return (
      <Page className="bn-site">
        {/* The saved list may hold another person's sites on a shared phone: no name without a session. */}
        <PageHeader back={back} title={t.siteFallbackTitle} />
        <SitesAccessState reason={configured ? 'signedOut' : 'unconfigured'} />
      </Page>
    );
  }

  if (status === 'notFound') {
    return (
      <Page className="bn-site">
        <PageHeader back={back} title={title} />
        <EmptyState icon="sites" title={t.notFoundTitle}
          action={<Button href={back.href}>{t.backToSites}</Button>}>
          <p>{t.notFoundText}</p>
        </EmptyState>
      </Page>
    );
  }

  const span = t.span[period];
  const location = t.approxLocation(formatMeters(APPROX_CELL_METERS, locale));
  const subtitle = stats ? t.subtitle(location, t.visitsIn(formatCount(t.visits, stats.active_days, locale), span)) : location;
  const working = csv.state.status === 'working';

  const periodControl = (
    <Segmented label={t.periodLabel} value={period} onChange={setPeriod}
      options={PERIODS.map(({ value }) => ({ value, label: dict.common.periods[value] }))} />
  );
  const exportButton = (
    // While the file is prepared the button keeps focus (aria-disabled); offline it cannot be used at all.
    <Button icon="export" block={!isDesktop} disabled={!online} aria-disabled={working} aria-busy={working}
      aria-describedby={online ? undefined : exportWhyId} onClick={() => { if (!working) void csv.run(); }}>
      {working ? t.exporting : t.exportPeriod[period]}
    </Button>
  );
  const exportFeedback = (
    <>
      {!online && <p id={exportWhyId} className="bn-site__hint">{t.exportNeedsConnection}</p>}
      {csv.state.status === 'failed' && <Notice tone="error">{t.exportError}</Notice>}
      {csv.state.status === 'done' && (csv.state.truncated
        ? <Notice tone="caution" icon="pending" live>{t.exportTruncated}</Notice>
        : <Notice tone="success" icon="check" live>{t.exportDone(csv.state.fileName)}</Notice>)}
    </>
  );

  return (
    <Page className="bn-site">
      <PageHeader back={back} title={title} subtitle={subtitle}
        actions={isDesktop ? <div className="bn-site__actions">{periodControl}{exportButton}</div> : undefined} />
      {isDesktop ? exportFeedback : periodControl}
      {status === 'offline' && <Notice tone="info" icon="offline" live>{stats ? t.statsOfflineCached : t.statsOffline}</Notice>}
      {status === 'error' && (
        <Notice tone="error" action={<Button variant="quiet" onClick={retry}>{dict.common.actions.retry}</Button>}>{t.statsError}</Notice>
      )}
      {stats ? (
        <div className="bn-site__grid">
          <div className="bn-site__aside">
            <SiteChorusCard stats={stats} period={period} />
          </div>
          <div className="bn-site__main">
            <SiteStatsRow stats={stats} period={period} />
            <SiteSpeciesList key={period} stats={stats} period={period} />
            {stats.missing.length > 0 && <MissingSpecies missing={stats.missing} period={period} />}
            {/* A permanent caveat, so it is not live: it would be read out on every period change. */}
            <Notice tone="caution">{stats.since === null ? dict.common.absenceCaveat : t.absence(span)}</Notice>
          </div>
        </div>
      ) : status === 'loading' && (
        <div className="bn-site__grid" role="status">
          <span className="visually-hidden">{t.statsLoading}</span>
          <span className="bn-site__skeleton bn-site__skeleton--chorus" aria-hidden="true" />
          <span className="bn-site__skeleton bn-site__skeleton--stats" aria-hidden="true" />
        </div>
      )}
      {!isDesktop && <div className="bn-site__export">{exportButton}{exportFeedback}</div>}
    </Page>
  );
}
