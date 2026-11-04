import { useMemo } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useQueueStatus } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { useAccountContext } from './accountContext';
import { AccountSummaryCard } from './AccountSummaryCard';
import { ClaimCard } from './ClaimCard';
import { DeleteAccountCard } from './DeleteAccountCard';
import { LocalStatsCard } from './LocalStatsCard';
import { localTotals } from './localTotals';
import { ProfileCard } from './ProfileCard';
import { RecoveryForm } from './RecoveryForm';
import { SecondStepCard } from './SecondStepCard';
import { ShareChoiceCard } from './ShareChoiceCard';
import { SyncRow } from './SyncRow';
import { pendingSync } from './syncStatus';
import { useAccountSummary } from './useAccountSummary';
import { applyReviews } from '../review/reviewPolicy';
import { useReviews } from '../review/useReviews';
import { useLocalRecords } from './useLocalRecords';

/**
 * Account screen: the profile, what the account and this phone hold, and the account's own settings. It only opens
 * signed in (ADR-45); offline, with a session that could not be renewed, it shows what the phone holds and says the rest
 * comes back with the signal.
 */
export default function AccountPage(): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account;
  const account = useAccountContext();
  const queue = useQueueStatus();
  const { sites } = useSites();
  const { session } = account;
  const userId = session?.user.id ?? null;
  const { records, error } = useLocalRecords();
  const summary = useAccountSummary(session?.access_token ?? null);
  const reviews = useReviews();
  // Totals count presence; what waits to upload (below) is counted as stored, whatever the verdict on it.
  const totals = useMemo(
    () => (records && reviews ? localTotals(applyReviews(records.pending, reviews), applyReviews(records.history, reviews)) : null),
    [records, reviews],
  );
  const pending = useMemo(
    () => (records && userId ? pendingSync(records.pending, userId) : null),
    [records, userId],
  );

  return (
    <Page width="narrow">
      <PageHeader title={texts.title} />

      {!session && account.identity && (
        <Notice tone="caution" icon="offline" title={texts.offline.title}>{texts.offline.text(account.identity.email ?? '')}</Notice>
      )}

      {session && account.recovering && <RecoveryForm account={account} />}
      <ShareChoiceCard />

      {session && (
        <>
          <ProfileCard account={account}>
            <SyncRow queue={queue} pending={pending} lastSyncedAt={totals?.lastSyncedAt ?? null} />
          </ProfileCard>
          {account.error && (account.errorScope === 'session' || account.errorScope === 'profile') && <Notice tone="error">{texts.errors[account.error]}</Notice>}
          <AccountSummaryCard state={summary} />
        </>
      )}

      <LocalStatsCard totals={totals} siteCount={sites.length} error={error} />

      {session && account.unownedCount > 0 && !account.claimed && (
        <ClaimCard count={account.unownedCount} working={account.working}
          onAccept={() => { void account.claimLocal(); }} onDecline={() => { account.declineClaim(); }} />
      )}
      {session && account.claimed && <Notice tone="success" icon="check" live>{texts.claim.done}</Notice>}

      <ListGroup>
        <ListRow icon="settings" label={texts.links.settings} href={routeHash({ name: 'settings' })} />
      </ListGroup>

      {/* Offline too: signing out of this phone needs no server, and the person may need to hand the phone over. */}
      {account.identity && (
        <ListGroup>
          {/* Acts here instead of opening another screen, so it has no chevron. */}
          <ListRow label={texts.signOut} tone="danger" chevron={false} busy={account.working}
            onClick={() => { void account.signOut(); }} />
        </ListGroup>
      )}
      {session && <SecondStepCard account={account} />}
      {session && <DeleteAccountCard account={account} />}
    </Page>
  );
}
