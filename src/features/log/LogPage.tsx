import { routeHash, type LogTab, type OutingFilter, type RecordKind } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { TabLinks } from '../../shared/ui/TabLinks';
import { CollectionsPart } from '../journal/CollectionsPart';
import { ObservationsPart } from '../journal/ObservationsPart';
import { OutingsPart } from '../journal/OutingsPart';
import { SongsPart } from './SongsPart';
import './LogPage.css';

export interface LogPageProps {
  readonly tab: LogTab;
  readonly show: RecordKind;
  readonly kind: OutingFilter;
}

/**
 * The log (ADR-47): the person's records, outings and collections, each a part with its own address, so a record
 * opened from a part returns to that part with its filter. The songs part is the log that came before the beta,
 * unchanged; visual observations sit beside it and never count in its acoustic summaries.
 */
export default function LogPage({ tab, show, kind }: LogPageProps): React.JSX.Element {
  const { dict } = useI18n();
  const t = dict.log;
  const action = tab === 'records'
    ? <Button variant="secondary" icon="camera" href={routeHash({ name: 'observations' })}>{t.addObservation}</Button>
    : undefined;
  return (
    <Page width="narrow" className="bn-log-page">
      <PageHeader title={t.title} subtitle={t.parts.intro[tab]} actions={action} />
      <TabLinks label={t.parts.label} links={[
        { key: 'records', label: t.parts.records, icon: 'log', href: routeHash({ name: 'log' }), current: tab === 'records' },
        { key: 'outings', label: t.parts.outings, icon: 'walk', href: routeHash({ name: 'log', tab: 'outings' }), current: tab === 'outings' },
        { key: 'collections', label: t.parts.collections, icon: 'album', href: routeHash({ name: 'log', tab: 'collections' }), current: tab === 'collections' },
      ]} />
      {tab === 'records' && (
        <>
          <TabLinks variant="chips" label={t.kinds.label} links={[
            { key: 'songs', label: t.kinds.songs, icon: 'listen', href: routeHash({ name: 'log' }), current: show === 'songs' },
            { key: 'observations', label: t.kinds.observations, icon: 'camera', href: routeHash({ name: 'log', show: 'observations' }), current: show === 'observations' },
          ]} />
          {show === 'songs' ? <SongsPart /> : <ObservationsPart />}
        </>
      )}
      {tab === 'outings' && <OutingsPart kind={kind} />}
      {tab === 'collections' && <CollectionsPart />}
    </Page>
  );
}
