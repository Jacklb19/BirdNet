import { useEffect, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { useAccountContext } from '../account/accountContext';
import { displayStatus } from '../log/logRecords';
import { useLogRecords } from '../log/useLogRecords';
import { AccountRecordingButton } from '../recordings/AccountRecordingButton';
import { useLocalRecording } from '../recordings/useRecordings';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { journalMessages } from './i18n';
import { LIST_PAGE_SIZE } from '../../config/lists';
import type { JournalState } from './JournalParts';
import { loadRemoteEvents } from './journalSync';
import type { TimelineEvent } from './types';

function EventCard({ event, online, onRemove, busy }: { readonly event: TimelineEvent; readonly online: boolean; readonly onRemove?: (event: TimelineEvent) => void; readonly busy: boolean }): React.JSX.Element {
  const { locale, dict } = useI18n(); const t = journalMessages[locale]; const names = useSpeciesNames(); const { session } = useAccountContext();
  const recording = useLocalRecording(event.kind === 'detection' ? event.id : '');
  return <li className="bn-journal__card"><time dateTime={event.recorded_at}>{new Date(event.recorded_at).toLocaleString(locale)}</time>
    <h3><a href={routeHash({ name: 'species', species: event.species })}>{commonName(names, event.species, locale)}</a></h3>
    <p>{event.kind === 'detection' ? t.detection : t.manual}</p>
    {event.kind === 'detection' ? <><p>{t.confidence}: {new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(event.confidence)} · {t.status}: {t.states[event.status]}</p>
      {recording ? <audio controls preload="none" src={recording.url} /> : event.has_recording && session && online ? <AccountRecordingButton detectionId={event.id} token={session.access_token} labels={dict.log.detail.account} /> : <p className="bn-journal__muted">{t.noClip}</p>}
    </> : event.individuals !== null && <p>{t.individuals}: {event.individuals}</p>}
    <div className="bn-journal__actions">
      <Button variant="quiet" href={routeHash(event.kind === 'detection' ? { name: 'detection', id: event.id } : { name: 'observations', id: event.id })}>{t.openRecord}</Button>
      {onRemove && <Button variant="quiet" disabled={busy} onClick={() => { onRemove(event); }}>{t.removeItem}</Button>}
    </div>
  </li>;
}
/** A collection's records can be taken out of it here; removing one keeps the record itself (ADR-46). */
export function Timeline({ kind, id, state, onRemove }: { readonly kind: 'outing' | 'collection'; readonly id: string; readonly state: JournalState; readonly onRemove?: (event: TimelineEvent) => void }): React.JSX.Element {
  const t = journalMessages[useI18n().locale]; const records = useLogRecords().everything; const [remote, setRemote] = useState<TimelineEvent[]>([]); const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(LIST_PAGE_SIZE);
  const parent = state.entities.find((row) => row.kind === kind && row.id === id);
  const version = parent && !parent.deleted ? parent.version : null;
  useEffect(() => {
    if (!state.owner || !state.online || version === null) return;
    const controller = new AbortController();
    void loadRemoteEvents(state.owner, kind, id, controller.signal).then((events) => { if (!controller.signal.aborted) { setRemote(events); setFailed(false); } }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); };
  }, [state.owner, state.online, kind, id, attempt, version]);
  const events = useMemo(() => {
    const merged = new Map(remote.map((event) => [`${event.kind}:${event.id}`, event]));
    const links = state.relations.filter((row) => row.parent === id && row.kind === (kind === 'outing' ? 'outingDetection' : 'collectionItem'));
    for (const link of links) {
      const key = `${link.recordKind}:${link.recordId}`;
      if (!link.present) { merged.delete(key); continue; }
      if (link.event && !merged.has(key)) merged.set(key, link.event);
      if (link.recordKind === 'detection') {
        const row = records?.find((entry) => entry.id === link.recordId);
        const cached = merged.get(key);
        if (row) merged.set(key, { kind: 'detection', id: row.id, species: row.species, recorded_at: new Date(row.recordedAt).toISOString(), confidence: row.confidence, status: displayStatus(row), has_recording: cached?.kind === 'detection' && cached.has_recording });
      }
    }
    for (const row of state.entities) if (row.kind === 'observation') {
      const key = `observation:${row.id}`;
      if (row.deleted || (kind === 'outing' && row.data.outing_id !== id)) merged.delete(key);
      else if (kind === 'outing' || links.some((link) => link.present && link.recordKind === 'observation' && link.recordId === row.id)) merged.set(key, { kind: 'observation', id: row.id, species: row.data.species, recorded_at: row.data.observed_at, individuals: row.data.individuals });
    }
    return [...merged.values()].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
  }, [remote, state.relations, state.entities, records, kind, id]);
  return <section className="bn-journal"><h2>{t.timeline}</h2><p>{t.approximate}</p>{failed && <Notice tone="error">{t.error}</Notice>}
    <Button variant="quiet" onClick={() => { setAttempt((value) => value + 1); }}>{t.retry}</Button>
    <ol className="bn-journal__list bn-journal__timeline">{events.slice(0, limit).map((event) => <EventCard key={`${event.kind}:${event.id}`} event={event} online={state.online} onRemove={onRemove} busy={state.busy} />)}</ol>{!events.length && <p>{t.empty}</p>}{events.length > limit && <Button variant="secondary" onClick={() => { setLimit((value) => value + LIST_PAGE_SIZE); }}>{t.showMore}</Button>}
  </section>;
}
