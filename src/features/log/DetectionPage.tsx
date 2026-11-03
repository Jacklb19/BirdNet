import { useCallback, useEffect, useState } from 'react';
import { routeHash } from '../../app/routes';
import { ApiError } from '../../config/api';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useAccountContext } from '../account/accountContext';
import { useQueueStatus } from '../offline/useQueueStatus';
import { fetchAccountDetection, type AccountDetection } from './accountDetection';
import { DetectionDetail } from './DetectionDetail';
import { useLogRecords } from './useLogRecords';
import './DetectionPage.css';

const HTTP_NOT_FOUND = 404;

type AccountLookup =
  | { readonly id: string; readonly state: 'loading' | 'failed' | 'missing' }
  | { readonly id: string; readonly state: 'found'; readonly detection: AccountDetection };

/**
 * Detail of one record of the log (`#/log/<id>`), looked up among the records kept on this phone and, when it is not
 * there, among the account's (ADR-44): recorded on another phone, or older than what this phone keeps.
 */
export default function DetectionPage({ id }: { readonly id: string }): React.JSX.Element {
  const { dict } = useI18n();
  const queue = useQueueStatus();
  const { session } = useAccountContext();
  const { everything: records, readAt, error, reload } = useLogRecords();
  const back = { href: routeHash({ name: 'log' }), label: dict.log.title };
  const record = records?.find((candidate) => candidate.id === id);
  const token = session?.access_token ?? null;
  const [lookup, setLookup] = useState<AccountLookup | null>(null);
  const [reads, setReads] = useState(0);
  const askAccount = records !== null && !record && token !== null && queue.online;

  useEffect(() => {
    if (!askAccount) return;
    const controller = new AbortController();
    void fetchAccountDetection(token, id, controller.signal)
      .then((detection) => { setLookup({ id, state: 'found', detection }); })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        // 404: not a song of this account either.
        const missing = failure instanceof ApiError && failure.status === HTTP_NOT_FOUND;
        setLookup({ id, state: missing ? 'missing' : 'failed' });
      });
    return () => { controller.abort(); };
  }, [askAccount, token, id, reads]);
  const readAgain = useCallback(() => { setReads((count) => count + 1); }, []);

  if (record) return <DetectionDetail record={record} online={queue.online} now={readAt} />;
  if (error) {
    return (
      <Page width="narrow">
        <PageHeader title={dict.log.title} back={back} />
        <Notice tone="error" action={<Button variant="quiet" onClick={reload}>{dict.common.actions.retry}</Button>}>{dict.log.loadError}</Notice>
      </Page>
    );
  }
  const found = lookup?.id === id ? lookup : null;
  if (found?.state === 'found' && token) {
    return <DetectionDetail record={found.detection.record} online={queue.online} now={readAt} account={{ detection: found.detection, token, onChanged: readAgain }} />;
  }
  if (!records || (askAccount && (!found || found.state === 'loading'))) {
    return <Page width="narrow"><p className="bn-log-detection__status" role="status">{dict.common.loading}</p></Page>;
  }
  if (found?.state === 'failed') {
    return (
      <Page width="narrow">
        <PageHeader title={dict.log.title} back={back} />
        <Notice tone="error" action={<Button variant="quiet" onClick={readAgain}>{dict.common.actions.retry}</Button>}>{dict.log.detail.account.loadError}</Notice>
      </Page>
    );
  }
  return (
    <Page width="narrow">
      <PageHeader title={dict.log.detail.notFound.title} back={back} />
      <p className="bn-log-detection__status">{dict.log.detail.notFound.text}</p>
      {token && !queue.online && <Notice tone="info">{dict.log.detail.account.offline}</Notice>}
    </Page>
  );
}
