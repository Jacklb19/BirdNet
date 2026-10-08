import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { SpeciesPlate } from '../species/SpeciesPlate';
import { useSites } from '../sites/useSites';
import { DetectionFacts } from './DetectionFacts';
import { DetectionStatusCard } from './DetectionStatusCard';
import { FragmentPlayer } from './FragmentPlayer';
import { formatConfidence, formatDayTime } from './logFormat';
import type { LogRecord } from './logRecords';
import { useAudioFragment } from './useAudioFragment';
import './DetectionDetail.css';

export interface DetectionDetailProps {
  readonly record: LogRecord;
  readonly online: boolean;
  readonly now: Date;
}

/** One detection: the bird on its plate, verification state with its confidence, the kept fragment if any, and the facts. */
export function DetectionDetail({ record, online, now }: DetectionDetailProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const names = useSpeciesNames();
  const { sites } = useSites();
  const fragment = useAudioFragment(record.audioId);
  const name = commonName(names, record.species, locale);
  const notes = [
    { label: dict.common.confidence, value: formatConfidence(record.confidence, locale) },
    { label: dict.log.detail.facts.upload, value: dict.common.status[record.status] },
    { label: dict.log.detail.facts.when, value: formatDayTime(record.recordedAt, now, locale) },
  ];
  return (
    <Page width="narrow" className="bn-log-detail">
      <a className="bn-log-detail__back" href={routeHash({ name: 'log' })}>
        <Icon name="back" size="s" />
        <span>{dict.log.detail.back}</span>
      </a>
      <SpeciesPlate scientificName={record.species} name={name} headingLevel={1} notes={notes}
        eyebrow={<><Icon name="log" size="s" />{dict.log.title}</>}>
        <Button variant="primary" icon="book" href={routeHash({ name: 'species', species: record.species })}>{dict.log.openSpecies}</Button>
      </SpeciesPlate>
      <DetectionStatusCard record={record} />
      {/* Keyed by the fragment, so playback state and a past failure never carry over to another one. */}
      {fragment && <FragmentPlayer key={fragment.url} fragment={fragment} />}
      <DetectionFacts record={record} sites={sites} online={online} now={now} />
    </Page>
  );
}
