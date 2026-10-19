import { useEffect, useId, useState } from 'react';
import { APPROX_CELL_METERS } from '../../config/contract';
import { formatCount, formatMeters, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Toggle } from '../../shared/ui/Toggle';
import { useAccountContext } from '../account/accountContext';
import { scheduleSynchronization } from '../offline/offlineClient';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { useQueueVersion } from '../offline/useQueueVersion';
import { useWalkData } from '../walk/useWalkData';
import { ACCOUNT_WALKS_DEFAULT_LIMIT } from '../walk/walk.config';
import { deleteAccountWalks, fetchWalkUsage, type WalkUsage } from '../walk/walksApi';
import { forgetAccountCopies } from '../walk/walkStore';
import { savesWalks } from '../walk/walkSync';
import './WalkSettings.css';

type Usage = { readonly status: 'idle' | 'loading' | 'unavailable' } | { readonly status: 'ready'; readonly usage: WalkUsage };

/** What the account's walks take of its quota, asked again after every upload and after deleting them. */
function useAccountWalkUsage(token: string | null, online: boolean, refresh: number): Usage {
  const version = useQueueVersion('walks');
  const [found, setFound] = useState<{ readonly key: string; readonly state: Usage } | null>(null);
  const key = `${token ?? ''}:${String(version)}:${String(refresh)}`;
  useEffect(() => {
    if (!token || !online) return;
    const controller = new AbortController();
    fetchWalkUsage(token, controller.signal)
      .then((usage) => { setFound({ key, state: { status: 'ready', usage } }); })
      .catch(() => { if (!controller.signal.aborted) setFound({ key, state: { status: 'unavailable' } }); });
    return () => { controller.abort(); };
  }, [token, online, key]);
  if (!token) return { status: 'idle' };
  if (found?.key === key) return found.state;
  return online ? { status: 'loading' } : { status: 'unavailable' };
}

/**
 * The walks (ADR-35): whether their paths also go to the account (off until the person says yes, because the path
 * leaves the phone), how many each place holds, and deleting the account's copies.
 */
export function WalkSettings({ offline }: { readonly offline: OfflineSettingsState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.walks;
  const uid = useId();
  const ids = { save: `${uid}-save`, saveDetail: `${uid}-save-detail` };
  const { settings, update } = offline;
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const { walks } = useWalkData();
  const [deleted, setDeleted] = useState(0);
  const account = useAccountWalkUsage(token, online, deleted);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const limit = account.status === 'ready' ? account.usage.limit : ACCOUNT_WALKS_DEFAULT_LIMIT;
  let accountText: string | null = null;
  if (account.status === 'ready') accountText = texts.accountUsage(formatCount(texts.count, account.usage.walks, locale), formatNumber(account.usage.limit, locale));
  else if (account.status === 'loading') accountText = texts.accountLoading;
  else if (account.status === 'unavailable') accountText = texts.accountUnavailable;
  const full = account.status === 'ready' && account.usage.walks >= account.usage.limit;

  const toggle = async (checked: boolean): Promise<void> => {
    if (await update({ saveWalks: checked }) && checked) void scheduleSynchronization().catch(() => undefined);
  };
  const remove = async (): Promise<void> => {
    if (!token) return;
    setWorking(true);
    setFailed(false);
    try {
      await deleteAccountWalks(token);
      await forgetAccountCopies();
      setDeleted((times) => times + 1);
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally { setWorking(false); }
  };

  return (
    <ListGroup title={texts.title}>
      <ListRow labelId={ids.save} descriptionId={ids.saveDetail} label={texts.save}
        description={token ? texts.saveDetail(formatMeters(APPROX_CELL_METERS, locale), formatCount(texts.count, limit, locale)) : texts.saveNeedsAccount}
        trailing={<Toggle labelledBy={ids.save} describedBy={ids.saveDetail} checked={Boolean(token) && Boolean(settings && savesWalks(settings))} disabled={!settings || !token}
          onChange={(checked) => { void toggle(checked); }} />} />
      <div className="bn-settings-walks">
        <p className="bn-settings-walks__line">
          <span>{texts.onPhone}</span>
          <span className="bn-settings-walks__value">{formatCount(texts.count, walks.length, locale)}</span>
        </p>
        {accountText && (
          <p className="bn-settings-walks__line">
            <span>{texts.inAccount}</span>
            <span className="bn-settings-walks__value">{accountText}</span>
          </p>
        )}
        {full && <Notice tone="caution" icon="pending">{texts.accountFull}</Notice>}
        {confirming ? (
          <div className="bn-settings-walks__confirm" role="group" aria-label={texts.deleteAccount}>
            <p>{texts.deleteAccountConfirm}</p>
            <div className="bn-settings-walks__actions">
              <Button variant="primary" disabled={working} onClick={() => { void remove(); }}>{texts.confirm}</Button>
              <Button variant="quiet" disabled={working} onClick={() => { setConfirming(false); setFailed(false); }}>{texts.cancel}</Button>
            </div>
          </div>
        ) : account.status === 'ready' && account.usage.walks > 0 && online && (
          <div className="bn-settings-walks__actions">
            <Button variant="quiet" onClick={() => { setConfirming(true); }}>{texts.deleteAccount}</Button>
          </div>
        )}
        {failed && <Notice tone="error" live>{texts.deleteFailed}</Notice>}
      </div>
    </ListGroup>
  );
}
