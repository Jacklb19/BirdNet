import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { useNotes } from '../notes/useNotes';
import { AccountRecordingButton } from '../recordings/AccountRecordingButton';
import { useLocalRecording } from '../recordings/useRecordings';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { SpeciesPlate } from '../species/SpeciesPlate';
import { useSites } from '../sites/useSites';
import { reviewAccountDetection, saveAccountNote, type AccountDetection } from './accountDetection';
import { DetectionFacts } from './DetectionFacts';
import { DetectionStatusCard } from './DetectionStatusCard';
import { formatConfidence, formatDayTime } from './logFormat';
import { displayStatus, type LogRecord } from './logRecords';
import { RecordingCard } from './RecordingCard';
import { NoteCard } from './NoteCard';
import { ReviewCard } from './ReviewCard';
import './DetectionDetail.css';

export interface DetectionDetailProps {
  readonly record: LogRecord;
  readonly online: boolean;
  readonly now: Date;
  /**
   * A song kept only in the account (ADR-44): its verdict and note go straight to the API with this session's token,
   * and its recording plays from the account. `onChanged` reads it again after a change.
   */
  readonly account?: { readonly detection: AccountDetection; readonly token: string; readonly onChanged: () => void };
}

/** One detection: the bird on its plate, verification state with its confidence, its recording if any, and the facts. */
export function DetectionDetail({ record, online, now, account }: DetectionDetailProps): React.JSX.Element {
  const { dict, locale } = useI18n();
  const names = useSpeciesNames();
  const { sites } = useSites();
  const recording = useLocalRecording(record.id);
  const notes = useNotes();
  const accountNote = account ? { id: record.id, ...account.detection.note, writtenAt: '', sync: 'done' as const } : null;
  const name = commonName(names, record.species, locale);
  const facts = [
    // After a correction the confidence is the model's, for the species it had said (audit F05).
    { label: record.modelSpecies ? dict.log.detail.facts.modelConfidence(commonName(names, record.modelSpecies, locale)) : dict.common.confidence,
      value: formatConfidence(record.confidence, locale) },
    { label: dict.log.detail.facts.upload, value: dict.common.status[displayStatus(record)] },
    { label: dict.log.detail.facts.when, value: formatDayTime(record.recordedAt, now, locale) },
  ];
  return (
    <Page width="narrow" className="bn-log-detail">
      <a className="bn-log-detail__back" href={routeHash({ name: 'log' })}>
        <Icon name="back" size="s" />
        <span>{dict.log.detail.back}</span>
      </a>
      <SpeciesPlate scientificName={record.species} name={name} headingLevel={1} notes={facts}
        eyebrow={account ? <><Icon name="synced" size="s" />{dict.log.detail.account.source}</> : <><Icon name="log" size="s" />{dict.log.title}</>}>
        <Button variant="primary" icon="book" href={routeHash({ name: 'species', species: record.species })}>{dict.log.openSpecies}</Button>
      </SpeciesPlate>
      <DetectionStatusCard record={record} modelName={record.modelSpecies ? commonName(names, record.modelSpecies, locale) : undefined} />
      {/* Keyed by the audio, so playback state and a past failure never carry over to another one. */}
      {recording && <RecordingCard key={recording.url} detectionId={record.id} recording={recording} online={online} />}
      {account?.detection.hasRecording && !recording && (
        <p className="bn-log-detail__account-recording">
          <AccountRecordingButton detectionId={record.id} token={account.token} labels={dict.log.detail.account} />
          <span>{dict.log.detail.account.play}</span>
        </p>
      )}
      {account ? (
        <>
          <ReviewCard record={record} onSave={async (verdict) => { await reviewAccountDetection(account.token, record.id, verdict); account.onChanged(); }} />
          <NoteCard key={`${record.id}:${JSON.stringify(account.detection.note)}`} detectionId={record.id} stored={accountNote}
            onSave={async (content) => { await saveAccountNote(account.token, record.id, content); account.onChanged(); }} />
        </>
      ) : (
        <>
          <ReviewCard record={record} />
          {/* Keyed by the record and its stored note: a half-typed note never moves to another record, and one saved elsewhere shows. */}
          {notes && <NoteCard key={`${record.id}:${notes.get(record.id)?.writtenAt ?? ''}`} detectionId={record.id} stored={notes.get(record.id) ?? null} />}
        </>
      )}
      <DetectionFacts record={record} sites={sites} online={online} now={now} />
    </Page>
  );
}
