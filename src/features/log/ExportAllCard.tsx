import { useId, useState } from 'react';
import { formatNumber, useI18n } from '../../i18n';
import { saveFile } from '../../shared/download';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { useOnline } from '../offline/useQueueStatus';
import { localIsoDate } from '../sites/siteText';
import { downloadPhoneCsv } from '../walk/walkActions';
import { exportAccountCsv } from '../walk/walksApi';

type ExportState =
  | { readonly status: 'idle' | 'working' | 'failed' }
  | { readonly status: 'done'; readonly file: string; readonly truncated: boolean; readonly count: number | null };

/**
 * The whole record as CSV (RF-16). With a session, from the account: every detection uploaded, the discarded ones
 * included with their state. Always, from this phone: built here with the same columns, so a person without an
 * account (or without a connection) can take their record away too.
 */
export function ExportAllCard(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = dict.log.exportAll;
  const { session } = useAccountContext();
  const online = useOnline();
  const whyId = useId();
  const phoneId = useId();
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const token = session?.access_token ?? null;
  const working = state.status === 'working';

  const run = async (source: 'account' | 'phone'): Promise<void> => {
    setState({ status: 'working' });
    try {
      if (source === 'phone') {
        const file = `trino-${t.phoneStem}-${localIsoDate(new Date())}.csv`;
        const count = await downloadPhoneCsv(file);
        setState({ status: 'done', file, truncated: false, count });
        return;
      }
      if (!token) return;
      const { blob, truncated } = await exportAccountCsv(token, null);
      const file = `trino-${t.fileStem}-${localIsoDate(new Date())}.csv`;
      saveFile(blob, file);
      setState({ status: 'done', file, truncated, count: null });
    } catch {
      setState({ status: 'failed' });
    }
  };

  return (
    <section className="bn-log__export">
      {/* While a file is prepared the buttons keep focus (aria-disabled); offline the account's cannot be used at all. */}
      {token && (
        <>
          <Button variant="secondary" icon="export" disabled={!online} aria-disabled={working} aria-busy={working}
            aria-describedby={whyId} onClick={() => { if (!working) void run('account'); }}>{t.action}</Button>
          <p id={whyId} className="bn-log__status">{online ? t.what : t.needsConnection}</p>
        </>
      )}
      <Button variant={token ? 'quiet' : 'secondary'} icon="export" aria-disabled={working} aria-busy={working} aria-describedby={phoneId}
        onClick={() => { if (!working) void run('phone'); }}>{t.phoneAction}</Button>
      <p id={phoneId} className="bn-log__status">{t.phoneWhat}</p>
      {state.status === 'failed' && <Notice tone="error">{t.error}</Notice>}
      {state.status === 'done' && (state.truncated
        ? <Notice tone="caution" icon="pending" live>{t.truncated}</Notice>
        : <Notice tone="success" icon="check" live>
          {state.count === null ? t.done(state.file) : t.phoneDone(state.file, formatNumber(state.count, locale))}
        </Notice>)}
    </section>
  );
}
