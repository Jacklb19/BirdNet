import { routeHash } from '../../app/routes';
import { formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { syncCounts, syncNotice, type LogRecord } from './logRecords';
import './LogSyncNotice.css';

export interface LogSyncNoticeProps {
  readonly records: readonly LogRecord[];
  readonly online: boolean;
  readonly syncFailed: boolean;
  readonly syncing: boolean;
  readonly onRetry: () => void;
}

/** Why some records are not in the cloud yet, and the one thing the person can do about it, if any. */
export function LogSyncNotice({ records, online, syncFailed, syncing, onRetry }: LogSyncNoticeProps): React.JSX.Element | null {
  const { dict, locale } = useI18n();
  const notice = syncNotice(syncCounts(records), { online, syncFailed });
  if (!notice) return null;
  const actions = notice.retry || notice.account ? (
    <span className="bn-log-sync__actions">
      {/* aria-disabled while it runs: `disabled` would drop the keyboard focus to the page. */}
      {notice.retry && (
        <Button variant="quiet" aria-disabled={syncing} aria-busy={syncing} onClick={() => { if (!syncing) onRetry(); }}>
          {syncing ? dict.log.sync.retrying : dict.common.actions.retry}
        </Button>
      )}
      {notice.account && <Button variant="quiet" href={routeHash({ name: 'account' })}>{dict.log.sync.goToAccount}</Button>}
    </span>
  ) : undefined;
  return (
    <Notice tone={notice.retry ? 'caution' : 'info'} icon="pending" action={actions}>
      {notice.lines.map((line) => <p key={line.kind}>{formatCount(dict.log.sync[line.kind], line.count, locale)}</p>)}
    </Notice>
  );
}
