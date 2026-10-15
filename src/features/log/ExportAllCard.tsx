import { useId, useState } from 'react';
import { useI18n } from '../../i18n';
import { saveFile } from '../../shared/download';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { useOnline } from '../offline/useQueueStatus';
import { localIsoDate } from '../sites/siteText';
import { exportAccountCsv } from '../walk/walksApi';

type ExportState = { readonly status: 'idle' | 'working' | 'failed' } | { readonly status: 'done'; readonly file: string; readonly truncated: boolean };

/**
 * The whole record of a signed-in person as CSV (RF-16), from the account: every detection they uploaded, the
 * discarded ones included with their state. Hidden without a session, since the account is where it comes from.
 */
export function ExportAllCard(): React.JSX.Element | null {
  const { dict } = useI18n();
  const t = dict.log.exportAll;
  const { session } = useAccountContext();
  const online = useOnline();
  const whyId = useId();
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const token = session?.access_token ?? null;
  if (!token) return null;
  const working = state.status === 'working';

  const run = async (): Promise<void> => {
    setState({ status: 'working' });
    try {
      const { blob, truncated } = await exportAccountCsv(token, null);
      const file = `trino-${t.fileStem}-${localIsoDate(new Date())}.csv`;
      saveFile(blob, file);
      setState({ status: 'done', file, truncated });
    } catch {
      setState({ status: 'failed' });
    }
  };

  return (
    <section className="bn-log__export">
      {/* While the file is prepared the button keeps focus (aria-disabled); offline it cannot be used at all. */}
      <Button variant="secondary" icon="export" disabled={!online} aria-disabled={working} aria-busy={working}
        aria-describedby={whyId} onClick={() => { if (!working) void run(); }}>{t.action}</Button>
      <p id={whyId} className="bn-log__status">{online ? t.what : t.needsConnection}</p>
      {state.status === 'failed' && <Notice tone="error">{t.error}</Notice>}
      {state.status === 'done' && (state.truncated
        ? <Notice tone="caution" icon="pending" live>{t.truncated}</Notice>
        : <Notice tone="success" icon="check" live>{t.done(state.file)}</Notice>)}
    </section>
  );
}
