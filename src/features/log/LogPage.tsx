import { useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useQueueStatus } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { matchesSearch } from '../species/album';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useWalkData } from '../walk/useWalkData';
import { AssignSiteCard } from './AssignSiteCard';
import { LOG_PAGE_SIZE } from './log.config';
import { LogDay } from './LogDay';
import { LogFilters } from './LogFilters';
import { groupByDay, matchesFilter, syncCounts, todaySummary, type LogFilter } from './logRecords';
import { LogSummary } from './LogSummary';
import { LogSyncNotice } from './LogSyncNotice';
import { useLogRecords } from './useLogRecords';
import './LogPage.css';

/** Site filter of the log: every record, one site, or the records without a site. */
const ALL_SITES = 'all';
const NO_SITE = 'none';

/** The field log: every detection kept on this phone, newest first and grouped by local day, searchable by species and site. */
export default function LogPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const queue = useQueueStatus();
  const names = useSpeciesNames();
  const { sites, active } = useSites();
  const { records, readAt, error, reload } = useLogRecords();
  const { walks } = useWalkData();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [query, setQuery] = useState('');
  const [site, setSite] = useState(ALL_SITES);
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);
  const searchId = useId();
  const siteId = useId();
  const visible = useMemo(() => (records ?? []).filter((record) =>
    matchesFilter(record, filter) &&
    (site === ALL_SITES || (site === NO_SITE ? record.siteId === null : record.siteId === site)) &&
    matchesSearch(query, record.species, commonName(names, record.species, locale)),
  ), [records, filter, site, query, names, locale]);
  // Only the shown slice is grouped and rendered; "show more" extends it.
  const groups = useMemo(() => groupByDay(visible.slice(0, limit), readAt), [visible, limit, readAt]);
  const unlocated = records ? syncCounts(records).noLocation : 0;
  const searching = query.trim() !== '' || site !== ALL_SITES;

  const restart = (): void => { setLimit(LOG_PAGE_SIZE); };

  let subtitle: string | undefined;
  if (records?.length) {
    const today = todaySummary(records, readAt);
    subtitle = today.detections
      ? dict.log.today.summary(formatCount(dict.log.today.detections, today.detections, locale), formatCount(dict.log.today.species, today.species, locale))
      : dict.log.today.none;
  }

  return (
    <Page width="narrow" className="bn-log">
      <PageHeader title={dict.log.title} subtitle={subtitle} />
      {error && (
        <Notice tone="error" action={<Button variant="quiet" onClick={reload}>{dict.common.actions.retry}</Button>}>{dict.log.loadError}</Notice>
      )}
      {records === null && !error && <p className="bn-log__status" role="status">{dict.common.loading}</p>}
      {records?.length === 0 && (
        <EmptyState icon="log" title={dict.log.empty.title}
          action={<Button href={routeHash({ name: 'listen' })} icon="listen">{dict.log.empty.action}</Button>}>
          {dict.log.empty.text}
        </EmptyState>
      )}
      {records?.length ? (
        <>
          {unlocated > 0 && <AssignSiteCard count={unlocated} sites={sites} activeSiteId={active?.id ?? null} />}
          <LogSummary records={records} walks={walks} now={readAt} />
          <LogSyncNotice records={records} online={queue.online} syncFailed={queue.syncFailed} syncing={queue.syncing} onRetry={() => { void queue.syncNow(); }} />
          <div className="bn-log__search" role="search" aria-label={dict.log.search.label}>
            <div className="bn-log__query">
              <label htmlFor={searchId} className="visually-hidden">{dict.log.search.placeholder}</label>
              <Icon name="search" size="s" />
              <input id={searchId} type="search" className="bn-log__query-input" placeholder={dict.log.search.placeholder} value={query}
                autoComplete="off" spellCheck={false} onChange={(event) => { setQuery(event.target.value); restart(); }} />
            </div>
            {sites.length > 0 && (
              <>
                <label htmlFor={siteId} className="visually-hidden">{dict.log.search.site}</label>
                <select id={siteId} className="bn-log__site" value={site} onChange={(event) => { setSite(event.target.value); restart(); }}>
                  <option value={ALL_SITES}>{dict.log.search.allSites}</option>
                  {sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  <option value={NO_SITE}>{dict.log.search.noSite}</option>
                </select>
              </>
            )}
          </div>
          <LogFilters value={filter} onChange={(next) => { setFilter(next); restart(); }} />
          {groups.length
            ? groups.map((group) => <LogDay key={group.day.getTime()} group={group} names={names} now={readAt} />)
            : <p className="bn-log__status">{searching ? dict.log.search.empty : dict.log.filters.empty[filter]}</p>}
          {visible.length > limit && (
            <Button variant="secondary" block onClick={() => { setLimit((current) => current + LOG_PAGE_SIZE); }}>{dict.log.showMore}</Button>
          )}
        </>
      ) : null}
    </Page>
  );
}
