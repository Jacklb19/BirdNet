import { useEffect, useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Dropdown } from '../../shared/ui/Dropdown';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { useQueueStatus } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { matchesSearch } from '../species/album';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useWalkData } from '../walk/useWalkData';
import { AccountSongsCard } from './AccountSongsCard';
import { AssignSiteCard } from './AssignSiteCard';
import { ExportAllCard } from './ExportAllCard';
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

interface ListState {
  readonly owner: string | null;
  readonly filter: LogFilter;
  readonly query: string;
  readonly site: string;
  readonly limit: number;
}

const FRESH: Omit<ListState, 'owner'> = { filter: 'all', query: '', site: ALL_SITES, limit: LOG_PAGE_SIZE };
/**
 * The list's filters while the tab is open (ADR-47): opening a record and coming back finds the same search, filter
 * and length, so the reading position can be restored. Kept in memory only, and only for the account that set it.
 */
let remembered: ListState = { owner: null, ...FRESH };

/** The songs of the log: every detection kept on this phone, newest first and grouped by local day, searchable by species and site. */
export function SongsPart(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const queue = useQueueStatus();
  const names = useSpeciesNames();
  const { sites, active } = useSites();
  const { records, everything, readAt, error, reload } = useLogRecords();
  const { walks } = useWalkData();
  const owner = useAccountContext().identity?.userId ?? null;
  const [initial] = useState(() => (remembered.owner === owner ? remembered : { owner, ...FRESH }));
  const [filter, setFilter] = useState<LogFilter>(initial.filter);
  const [query, setQuery] = useState(initial.query);
  const [site, setSite] = useState(initial.site);
  const [limit, setLimit] = useState(initial.limit);
  useEffect(() => { remembered = { owner, filter, query, site, limit }; }, [owner, filter, query, site, limit]);
  const searchId = useId();
  const siteId = useId();
  // The list shows discarded records too, marked as such; the summaries above it count only presence.
  const visible = useMemo(() => (everything ?? []).filter((record) =>
    matchesFilter(record, filter) &&
    (site === ALL_SITES || (site === NO_SITE ? record.siteId === null : record.siteId === site)) &&
    matchesSearch(query, record.species, commonName(names, record.species, locale)),
  ), [everything, filter, site, query, names, locale]);
  // Only the shown slice is grouped and rendered; "show more" extends it.
  const groups = useMemo(() => groupByDay(visible.slice(0, limit), readAt), [visible, limit, readAt]);
  const unlocated = everything ? syncCounts(everything).noLocation : 0;
  const searching = query.trim() !== '' || site !== ALL_SITES;
  const localIds = useMemo(() => new Set((everything ?? []).map((record) => record.id)), [everything]);

  const restart = (): void => { setLimit(LOG_PAGE_SIZE); };

  let today: string | undefined;
  if (records?.length) {
    const summary = todaySummary(records, readAt);
    today = summary.detections
      ? dict.log.today.summary(formatCount(dict.log.today.detections, summary.detections, locale), formatCount(dict.log.today.species, summary.species, locale))
      : dict.log.today.none;
  }

  return (
    <div className="bn-log">
      {today && <p className="bn-log__today">{today}</p>}
      {error && (
        <Notice tone="error" action={<Button variant="quiet" onClick={reload}>{dict.common.actions.retry}</Button>}>{dict.log.loadError}</Notice>
      )}
      {records === null && !error && <p className="bn-log__status" role="status">{dict.common.loading}</p>}
      {/* The account's songs this phone does not keep, so they can be reviewed from here too (ADR-44). */}
      {records !== null && <AccountSongsCard local={localIds} online={queue.online} now={readAt} />}
      {everything?.length === 0 && (
        <EmptyState icon="log" title={dict.log.empty.title}
          action={(
            <div className="bn-log__empty-actions">
              <Button href={routeHash({ name: 'listen' })} icon="listen">{dict.log.empty.action}</Button>
              <Button variant="secondary" href={routeHash({ name: 'map' })} icon="walk">{dict.log.empty.walk}</Button>
              {/* A walk can be saved without any song; the outings part lists it with the others (ADR-47). */}
              <Button variant="quiet" href={routeHash({ name: 'log', tab: 'outings', kind: 'walk' })}>{dict.log.empty.walks}</Button>
            </div>
          )}>
          {dict.log.empty.text}
        </EmptyState>
      )}
      {everything && everything.length > 0 && (
        <>
          {unlocated > 0 && <AssignSiteCard count={unlocated} sites={sites} activeSiteId={active?.id ?? null} />}
          {records && records.length > 0 && <LogSummary records={records} walks={walks} now={readAt} />}
          <LogSyncNotice records={everything} online={queue.online} syncFailed={queue.syncFailed} syncing={queue.syncing} onRetry={() => { void queue.syncNow(); }} />
          <div className="bn-log__search" role="search" aria-label={dict.log.search.label}>
            <div className="bn-log__query">
              <label htmlFor={searchId} className="visually-hidden">{dict.log.search.placeholder}</label>
              <Icon name="search" size="s" />
              <input id={searchId} type="search" className="bn-log__query-input" placeholder={dict.log.search.placeholder} value={query}
                autoComplete="off" spellCheck={false} onChange={(event) => { setQuery(event.target.value); restart(); }} />
            </div>
            {sites.length > 0 && (
              <>
                <span id={siteId} className="visually-hidden">{dict.log.search.site}</span>
                <Dropdown labelId={siteId} className="bn-log__site" icon="sites" value={site} onChange={(next) => { setSite(next); restart(); }}
                  options={[
                    { value: ALL_SITES, label: dict.log.search.allSites },
                    ...sites.map((entry) => ({ value: entry.id, label: entry.name })),
                    { value: NO_SITE, label: dict.log.search.noSite },
                  ]} />
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
      )}
      <ExportAllCard hasLocalRecords={Boolean(everything?.length)} />
    </div>
  );
}
