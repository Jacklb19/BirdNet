import { useId, useState } from 'react';
import { formatDataSize, formatCount, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { ListGroup, ListRow } from '../../shared/ui/ListGroup';
import { Notice } from '../../shared/ui/Notice';
import { Toggle } from '../../shared/ui/Toggle';
import { useAccountContext } from '../account/accountContext';
import type { OfflineSettingsState } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { ACCOUNT_RECORDINGS_DEFAULT_LIMIT_BYTES } from '../recordings/recordings.config';
import { deleteAllRecordings } from '../recordings/recordingStore';
import { deleteAccountRecordings } from '../recordings/recordingsApi';
import { savesRecordings } from '../recordings/recordingSync';
import { useAccountRecordingUsage, useLocalRecordingUsage } from '../recordings/useRecordings';
import './RecordingSettings.css';

type Place = 'local' | 'account';

/** WebCodecs is what compresses the clips; without it the phone keeps none (and the switch says why). */
const canCompress = (): boolean => 'AudioEncoder' in globalThis;

/**
 * The recordings: whether each song keeps its clip on the phone, whether the clips also go to the account (off
 * until the person says yes, because that audio leaves the phone), what both places hold, and deleting them.
 */
export function RecordingSettings({ offline }: { readonly offline: OfflineSettingsState }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.settings.recordings;
  const uid = useId();
  const ids = { keep: `${uid}-keep`, keepDetail: `${uid}-keep-detail`, save: `${uid}-save`, saveDetail: `${uid}-save-detail` };
  const { settings, update } = offline;
  const { session } = useAccountContext();
  const online = useOnline();
  const token = session?.access_token ?? null;
  const [deleted, setDeleted] = useState(0);
  const local = useLocalRecordingUsage();
  const account = useAccountRecordingUsage(token, online, deleted);
  const [confirming, setConfirming] = useState<Place | null>(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const compresses = canCompress();

  const count = (recordings: number): string => formatCount(texts.count, recordings, locale);
  const accountLimit = account.status === 'ready' ? formatDataSize(account.usage.limitBytes, locale) : null;
  let accountText: string | null = null;
  if (account.status === 'ready') accountText = texts.accountUsage(count(account.usage.recordings), formatDataSize(account.usage.bytes, locale), formatDataSize(account.usage.limitBytes, locale));
  else if (account.status === 'loading') accountText = texts.accountLoading;
  else if (account.status === 'unavailable') accountText = texts.accountUnavailable;
  const full = account.status === 'ready' && account.usage.bytes >= account.usage.limitBytes;

  const remove = async (place: Place): Promise<void> => {
    setWorking(true);
    setFailed(false);
    try {
      if (place === 'local') await deleteAllRecordings();
      else if (token) await deleteAccountRecordings(token);
      setDeleted((times) => times + 1);
      setConfirming(null);
    } catch {
      setFailed(true);
    } finally { setWorking(false); }
  };

  return (
    <ListGroup title={texts.title}>
      <ListRow labelId={ids.keep} descriptionId={ids.keepDetail} label={texts.keep} description={compresses ? texts.keepDetail : texts.keepUnsupported}
        trailing={<Toggle labelledBy={ids.keep} describedBy={ids.keepDetail} checked={compresses && settings?.keepRecordings !== false} disabled={!settings || !compresses}
          onChange={(checked) => { void update({ keepRecordings: checked }); }} />} />
      <ListRow labelId={ids.save} descriptionId={ids.saveDetail} label={texts.save}
        description={token ? texts.saveDetail(accountLimit ?? formatDataSize(ACCOUNT_RECORDINGS_DEFAULT_LIMIT_BYTES, locale)) : texts.saveNeedsAccount}
        trailing={<Toggle labelledBy={ids.save} describedBy={ids.saveDetail} checked={Boolean(token) && Boolean(settings && savesRecordings(settings))} disabled={!settings || !token}
          onChange={(checked) => { void update({ saveRecordings: checked }); }} />} />
      <div className="bn-settings-recordings">
        <p className="bn-settings-recordings__line">
          <span>{texts.onPhone}</span>
          {local && <span className="bn-settings-recordings__value">{texts.localUsage(count(local.recordings), formatDataSize(local.bytes, locale))}</span>}
        </p>
        {accountText && (
          <p className="bn-settings-recordings__line">
            <span>{texts.inAccount}</span>
            <span className="bn-settings-recordings__value">{accountText}</span>
          </p>
        )}
        {full && <Notice tone="caution" icon="pending">{texts.accountFull}</Notice>}
        {confirming ? (
          <div className="bn-settings-recordings__confirm" role="group" aria-label={confirming === 'local' ? texts.deleteLocal : texts.deleteAccount}>
            <p>{confirming === 'local' ? texts.deleteLocalConfirm : texts.deleteAccountConfirm}</p>
            <div className="bn-settings-recordings__actions">
              <Button variant="primary" disabled={working} onClick={() => { void remove(confirming); }}>{texts.confirm}</Button>
              <Button variant="quiet" disabled={working} onClick={() => { setConfirming(null); setFailed(false); }}>{texts.cancel}</Button>
            </div>
          </div>
        ) : (
          <div className="bn-settings-recordings__actions">
            {Boolean(local?.recordings) && <Button variant="quiet" onClick={() => { setConfirming('local'); }}>{texts.deleteLocal}</Button>}
            {account.status === 'ready' && account.usage.recordings > 0 && online && (
              <Button variant="quiet" onClick={() => { setConfirming('account'); }}>{texts.deleteAccount}</Button>
            )}
          </div>
        )}
        {failed && <Notice tone="error" live>{texts.deleteFailed}</Notice>}
      </div>
    </ListGroup>
  );
}
