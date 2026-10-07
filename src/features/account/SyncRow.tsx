import { formatCount, formatDate, useI18n, type Locale, type Messages } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { useNow } from '../../shared/useNow';
import type { QueueStatus } from '../offline/useQueueStatus';
import { SYNC_AGE_REFRESH_MS } from './account.config';
import { syncAge } from './syncAge';
import { syncPhase, type PendingSync, type SyncPhase } from './syncStatus';
import './SyncRow.css';

type SyncTexts = Messages['account']['sync'];

function ageText(texts: SyncTexts, lastSyncedAt: string | null, now: number, locale: Locale): string {
  const age = syncAge(lastSyncedAt, now);
  if (!age) return texts.nothingYet;
  switch (age.unit) {
    case 'justNow': return texts.justNow;
    case 'minutes': return formatCount(texts.minutesAgo, age.value, locale);
    case 'hours': return formatCount(texts.hoursAgo, age.value, locale);
    case 'date': return texts.since(formatDate(age.date, locale, { timeStyle: undefined }));
  }
}

interface SyncView {
  readonly icon: IconName;
  readonly title: string;
  readonly detail: string | null;
}

export interface SyncRowProps {
  readonly queue: QueueStatus;
  /** Null while the local records are being read. */
  readonly pending: PendingSync | null;
  readonly lastSyncedAt: string | null;
}

/** Where this phone's records stand with the server: all uploaded, waiting, uploading or failing. */
export function SyncRow({ queue, pending, lastSyncedAt }: SyncRowProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.account.sync;
  // Refreshed at the finest unit the age line shows.
  const now = useNow(SYNC_AGE_REFRESH_MS);
  const { online, syncing, syncFailed, syncNow } = queue;
  const uploadable = pending?.uploadable ?? 0;
  const phase: SyncPhase | null = pending ? syncPhase({ uploadable, online, syncing, syncFailed }) : null;

  const view = ((): SyncView | null => {
    switch (phase) {
      case null: return null;
      // The records are re-read while an attempt runs, so the count can reach zero before the attempt ends.
      case 'syncing': return { icon: 'pending', title: texts.syncing, detail: uploadable > 0 ? formatCount(texts.pending, uploadable, locale) : null };
      case 'synced': return { icon: 'synced', title: texts.synced, detail: ageText(texts, lastSyncedAt, now, locale) };
      case 'offline': return { icon: 'offline', title: formatCount(texts.waitingConnection, uploadable, locale), detail: texts.waitingDetail };
      case 'failed': return { icon: 'pending', title: texts.failed, detail: texts.failedDetail };
      case 'pending': return { icon: 'pending', title: formatCount(texts.pending, uploadable, locale), detail: texts.pendingDetail };
    }
  })();
  const withoutLocation = pending?.withoutLocation ?? 0;

  return (
    <div className="bn-account-sync">
      <span className={`bn-account-sync__icon bn-account-sync__icon--${phase ?? 'loading'}`}>
        <Icon name={view?.icon ?? 'pending'} />
      </span>
      <div className="bn-account-sync__text">
        {/* Only the state line is live: the age ticks every minute and would otherwise be read out each time. */}
        <p className="bn-account-sync__title" role="status">{view?.title ?? dict.common.loading}</p>
        {view?.detail && <p className="bn-account-sync__detail">{view.detail}</p>}
        {withoutLocation > 0 && (
          <p className="bn-account-sync__detail">{formatCount(texts.withoutLocation, withoutLocation, locale)}</p>
        )}
      </div>
      {/* Stays while a manual attempt runs (aria-disabled, not `disabled`), so the focus stays on the button that started it. */}
      {online && uploadable > 0 && (
        <Button variant="quiet" className="bn-account-sync__action" aria-disabled={syncing} aria-busy={syncing}
          onClick={() => { if (!syncing) void syncNow(); }}>{texts.syncNow}</Button>
      )}
    </div>
  );
}
