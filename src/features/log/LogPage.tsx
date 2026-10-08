import { useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useQueueStatus } from '../offline/useQueueStatus';
import { useSpeciesNames } from '../species/speciesNames';
import { LOG_PAGE_SIZE } from './log.config';
import { LogDay } from './LogDay';
import { LogFilters } from './LogFilters';
import { groupByDay, matchesFilter, todaySummary, type LogFilter } from './logRecords';
import { LogSyncNotice } from './LogSyncNotice';
import { useLogRecords } from './useLogRecords';
import './LogPage.css';

/** The field log: every detection kept on this phone, newest first and grouped by local day. */
export default function LogPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const queue = useQueueStatus();
  const names = useSpeciesNames();
  const { records, readAt, error, reload } = useLogRecords();
  const [filter, setFilter] = useState<LogFilter>('all');
  const [limit, setLimit] = useState(LOG_PAGE_SIZE);
  const visible = useMemo(() => (records ?? []).filter((record) => matchesFilter(record, filter)), [records, filter]);
  // Only the shown slice is grouped and rendered; "show more" extends it.
  const groups = useMemo(() => groupByDay(visible.slice(0, limit), readAt), [visible, limit, readAt]);

  const changeFilter = (next: LogFilter): void => {
    setFilter(next);
    setLimit(LOG_PAGE_SIZE);
  };

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
          <LogSyncNotice records={records} online={queue.online} syncFailed={queue.syncFailed} syncing={queue.syncing} onRetry={() => { void queue.syncNow(); }} />
          <LogFilters value={filter} onChange={changeFilter} />
          {groups.length
            ? groups.map((group) => <LogDay key={group.day.getTime()} group={group} names={names} now={readAt} />)
            : <p className="bn-log__status">{dict.log.filters.empty[filter]}</p>}
          {visible.length > limit && (
            <Button variant="secondary" block onClick={() => { setLimit((current) => current + LOG_PAGE_SIZE); }}>{dict.log.showMore}</Button>
          )}
        </>
      ) : null}
    </Page>
  );
}
