import { useI18n } from '../../i18n';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { useSites } from '../sites/useSites';
import { DetectionFacts } from './DetectionFacts';
import { DetectionHero } from './DetectionHero';
import { DetectionStatusCard } from './DetectionStatusCard';
import { FragmentPlayer } from './FragmentPlayer';
import type { LogRecord } from './logRecords';
import { useAudioFragment } from './useAudioFragment';
import './DetectionDetail.css';

export interface DetectionDetailProps {
  readonly record: LogRecord;
  readonly online: boolean;
  readonly now: Date;
}

/** One detection: photo, names, verification state with its confidence, the kept fragment if any, and the facts. */
export function DetectionDetail({ record, online, now }: DetectionDetailProps): React.JSX.Element {
  const { locale } = useI18n();
  const names = useSpeciesNames();
  const { sites } = useSites();
  const fragment = useAudioFragment(record.audioId);
  const name = commonName(names, record.species, locale);
  return (
    <Page bleed className="bn-log-detail">
      <DetectionHero scientificName={record.species} name={name} />
      <div className="bn-log-detail__body">
        <PageHeader title={name} subtitle={name === record.species ? undefined : <span className="scientific bn-log-detail__scientific">{record.species}</span>} />
        <DetectionStatusCard record={record} />
        {/* Keyed by the fragment, so playback state and a past failure never carry over to another one. */}
        {fragment && <FragmentPlayer key={fragment.url} fragment={fragment} />}
        <DetectionFacts record={record} sites={sites} online={online} now={now} />
      </div>
    </Page>
  );
}
