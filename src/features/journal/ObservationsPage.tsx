import { useId, useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { DateTimeField } from '../../shared/ui/DateTimeField';
import { Dropdown } from '../../shared/ui/Dropdown';
import { FilePicker } from '../../shared/ui/FilePicker';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { getSettings } from '../offline/queueStore';
import { approximateLocation } from '../offline/queuePolicy';
import { JOURNAL_NOTE_LIMIT, OBSERVATION_PHOTO_ACCEPT } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalNotices, ObservationImage, SpeciesField, type JournalState } from './JournalParts';
import { deleteEntity, deletePhoto, saveEntity, savePhoto } from './journalStore';
import { observationPhoto } from './photo';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanNote, localDateTime } from './validation';
import './Journal.css';

interface FormProps {
  readonly row?: EntityRecord<'observation'>;
  readonly state: JournalState;
  /** The outing a new observation starts in, when it is added from that outing's page. */
  readonly outingId?: string;
}

function ObservationForm({ row, state, outingId }: FormProps): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const outingLabel = useId();
  const [species, setSpecies] = useState(row?.data.species ?? ''); const [date, setDate] = useState(localDateTime(row?.data.observed_at));
  const [note, setNote] = useState(row?.data.note ?? ''); const [individuals, setIndividuals] = useState(row?.data.individuals?.toString() ?? '');
  const [outing, setOuting] = useState(row?.data.outing_id ?? outingId ?? ''); const [latitude, setLatitude] = useState(row?.data.location?.latitude.toString() ?? ''); const [longitude, setLongitude] = useState(row?.data.location?.longitude.toString() ?? '');
  const [photo, setPhoto] = useState<File | null>(null); const [confirm, setConfirm] = useState(false);
  const outings = state.entities.flatMap((entry) => entry.kind === 'outing' && !entry.deleted
    ? [{ value: entry.id, label: entry.data.title ?? new Date(entry.data.started_at).toLocaleString(locale), detail: entry.data.title ? new Date(entry.data.started_at).toLocaleString(locale) : undefined }] : []);
  return <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); const owner = state.owner; if (!owner) return; void state.run(async () => {
    if ((latitude.trim() === '') !== (longitude.trim() === '')) throw new Error('Both coordinates are required.');
    const location = latitude.trim() ? approximateLocation(Number(latitude), Number(longitude)) : null;
    const processed = photo ? await observationPhoto(photo) : null;
    if ((await getSettings()).session?.userId !== owner) throw new Error('Account changed.');
    const id = await saveEntity(owner, 'observation', { species: species.trim(), observed_at: new Date(date).toISOString(), note: cleanNote(note),
      individuals: individuals.trim() ? Number(individuals) : null, outing_id: outing || null, location }, row?.id);
    if (processed) await savePhoto(owner, id, processed);
    navigateTo({ name: 'observations', id });
  }); }}>
    <p className="bn-journal__muted">{t.manualHelp}</p>
    <SpeciesField value={species} onChange={setSpecies} />
    <DateTimeField label={t.observedAt} required value={date} onChange={setDate} max={new Date()} />
    <label>{t.individuals}<input type="number" inputMode="numeric" min={1} max={999} step={1} value={individuals} onChange={(event) => { setIndividuals(event.target.value); }} /></label>
    <div className="bn-journal__field"><span id={outingLabel}>{t.outing}</span><Dropdown labelId={outingLabel} value={outing} onChange={setOuting}
      options={[{ value: '', label: t.none }, ...outings]} /></div>
    <label>{t.note}<textarea value={note} maxLength={JOURNAL_NOTE_LIMIT} onChange={(event) => { setNote(event.target.value); }} /></label>
    <FilePicker label={t.photo} accept={OBSERVATION_PHOTO_ACCEPT} file={photo} onChange={setPhoto} icon="camera" hint={t.photoLocal} />
    {row && state.owner && <><ObservationImage owner={state.owner} id={row.id} /><Button variant="quiet" disabled={state.busy} onClick={() => { void state.run(() => deletePhoto(row.owner, row.id), false); }}>{t.removePhoto}</Button></>}
    {/* The place is optional and typed by hand, so it stays folded until it is wanted. */}
    <details className="bn-journal__disclosure" open={Boolean(latitude || longitude) || undefined}>
      <summary className="bn-journal__summary"><span>{t.placeTitle}</span></summary>
      <div className="bn-journal__form">
        <p className="bn-journal__muted">{t.locationHelp}</p>
        <label>{t.latitude}<input type="number" inputMode="decimal" min={-90} max={90} step="any" value={latitude} onChange={(event) => { setLatitude(event.target.value); }} /></label>
        <label>{t.longitude}<input type="number" inputMode="decimal" min={-180} max={180} step="any" value={longitude} onChange={(event) => { setLongitude(event.target.value); }} /></label>
      </div>
    </details>
    <div className="bn-journal__actions">
      <Button type="submit" disabled={state.busy}>{t.save}</Button>
      {row && <Button variant="quiet" onClick={() => { setConfirm(!confirm); }}>{t.remove}</Button>}
      {row && confirm && <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(async () => { await deleteEntity(row.owner, 'observation', row.id); await deletePhoto(row.owner, row.id); navigateTo({ name: 'log', show: 'observations' }); }); }}>{t.confirmDelete}</Button>}
    </div>
  </form>;
}

/**
 * One visual observation (ADR-46): a new one, or one to edit. It returns to the outing it belongs to when it was
 * added from there, and otherwise to the observations of the log.
 */
export default function ObservationsPage({ id, outing }: { readonly id?: string; readonly outing?: string }): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const state = useJournal();
  const selected = id ? state.entities.find((entry): entry is EntityRecord<'observation'> => entry.kind === 'observation' && entry.id === id && (!entry.deleted || entry.conflict)) : undefined;
  const parent = outing ?? selected?.data.outing_id ?? null;
  const back = parent ? { href: routeHash({ name: 'outing', id: parent }), label: t.backTo.outing } : { href: routeHash({ name: 'log', show: 'observations' }), label: t.backTo.observations };
  return <Page width="narrow" className="bn-journal"><PageHeader title={id ? t.observationTitle : t.newObservation} back={back} /><JournalNotices state={state} />
    {selected && <EntityStatus row={selected} state={state} />}
    {(!id || selected) && <ObservationForm key={`${id ?? 'new'}:${String(selected?.version ?? 0)}`} row={selected} state={state} outingId={outing} />}
    {id && !selected && state.ready && !state.busy && <p>{t.empty}</p>}
  </Page>;
}
