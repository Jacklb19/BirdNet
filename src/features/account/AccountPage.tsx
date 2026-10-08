import { useMemo } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useQueueStatus } from '../offline/useQueueStatus';
import { requestSettingsSection } from '../settings/settingsSections';
import { useSites } from '../sites/useSites';
import { useAccountContext } from './accountContext';
import { AccountSummaryCard } from './AccountSummaryCard';
import { ClaimCard } from './ClaimCard';
import { LocalStatsCard } from './LocalStatsCard';
import { localTotals } from './localTotals';
import { ProfileCard } from './ProfileCard';
import { RecoveryForm } from './RecoveryForm';
import { SignInForm } from './SignInForm';
import { SyncRow } from './SyncRow';
import { pendingSync } from './syncStatus';
import { useAccountSummary } from './useAccountSummary';
import { useLocalRecords } from './useLocalRecords';

/** Account screen: the cloud account when this build has one, and what this phone holds in every case. */
export default function AccountPage(): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.account;
  const account = useAccountContext();
  const queue = useQueueStatus();
  const { sites } = useSites();
  const { settings } = useOfflineSettings();
  const { session } = account;
  const userId = session?.user.id ?? null;
  const audioConsent = settings?.audioConsent ?? false;
  const { records, error } = useLocalRecords();
  const summary = useAccountSummary(session?.access_token ?? null);
  const totals = useMemo(() => (records ? localTotals(records.pending, records.history) : null), [records]);
  const pending = useMemo(
    () => (records && userId ? pendingSync(records.pending, userId, audioConsent) : null),
    [records, userId, audioConsent],
  );

  return (
    <Page width="narrow">
      <PageHeader title={texts.title} />

      {!account.configured && (
        <Notice tone="info" icon="privacy" title={texts.unavailable.title}>{texts.unavailable.text}</Notice>
      )}

      {account.configured && !session && <SignInForm account={account} />}

      {session && account.recovering && <RecoveryForm account={account} />}

      {session && (
        <>
          <ProfileCard account={account}>
            <SyncRow queue={queue} pending={pending} lastSyncedAt={totals?.lastSyncedAt ?? null} />
          </ProfileCard>
          {account.error && !account.recovering && <Notice tone="error">{texts.errors[account.error]}</Notice>}
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
        <ListRow icon="privacy" label={texts.links.privacy} href={routeHash({ name: 'settings' })}
          onClick={() => { requestSettingsSection('permissions'); }} />
      </ListGroup>

      {session && (
        <ListGroup>
          {/* Acts here instead of opening another screen, so it has no chevron. */}
          <ListRow label={texts.signOut} tone="danger" chevron={false} busy={account.working}
            onClick={() => { void account.signOut(); }} />
        </ListGroup>
      )}
    </Page>
  );
}
