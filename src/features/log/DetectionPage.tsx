import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useQueueStatus } from '../offline/useQueueStatus';
import { DetectionDetail } from './DetectionDetail';
import { useLogRecords } from './useLogRecords';
import './DetectionPage.css';

/** Detail of one record of the log (`#/log/<id>`), looked up among the records kept on this phone. */
export default function DetectionPage({ id }: { readonly id: string }): React.JSX.Element {
  const { dict } = useI18n();
  const queue = useQueueStatus();
  const { records, readAt, error, reload } = useLogRecords();
  const back = { href: routeHash({ name: 'log' }), label: dict.log.title };
  const record = records?.find((candidate) => candidate.id === id);

  if (record) return <DetectionDetail record={record} online={queue.online} now={readAt} />;
  if (error) {
    return (
      <Page width="narrow">
        <PageHeader title={dict.log.title} back={back} />
        <Notice tone="error" action={<Button variant="quiet" onClick={reload}>{dict.common.actions.retry}</Button>}>{dict.log.loadError}</Notice>
      </Page>
    );
  }
  if (!records) return <Page width="narrow"><p className="bn-log-detection__status" role="status">{dict.common.loading}</p></Page>;
  return (
    <Page width="narrow">
      <PageHeader title={dict.log.detail.notFound.title} back={back} />
      <p className="bn-log-detection__status">{dict.log.detail.notFound.text}</p>
    </Page>
  );
}
