import { useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { getSettings } from '../offline/queueStore';
import { approximateLocation } from '../offline/queuePolicy';
import { JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalLinks, JournalNotices, ObservationImage, SpeciesField, type JournalState } from './JournalParts';
import { deleteEntity, deletePhoto, saveEntity, savePhoto } from './journalStore';
import { observationPhoto } from './photo';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanNote, localDateTime } from './validation';
import './Journal.css';

function ObservationForm({ row, state }: { readonly row?: EntityRecord<'observation'>; readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  const [species, setSpecies] = useState(row?.data.species ?? ''); const [date, setDate] = useState(localDateTime(row?.data.observed_at));
  const [note, setNote] = useState(row?.data.note ?? ''); const [individuals, setIndividuals] = useState(row?.data.individuals?.toString() ?? '');
  const [outing, setOuting] = useState(row?.data.outing_id ?? ''); const [latitude, setLatitude] = useState(row?.data.location?.latitude.toString() ?? ''); const [longitude, setLongitude] = useState(row?.data.location?.longitude.toString() ?? '');
  const [photo, setPhoto] = useState<File | null>(null); const [confirm, setConfirm] = useState(false);
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
    <h2>{row ? t.edit : t.newObservation}</h2><p>{t.manual}</p><SpeciesField value={species} onChange={setSpecies} />
    <label>{t.observedAt}<input type="datetime-local" required value={date} onChange={(event) => { setDate(event.target.value); }} /></label>
    <label>{t.individuals}<input type="number" min={1} max={999} step={1} value={individuals} onChange={(event) => { setIndividuals(event.target.value); }} /></label>
    <label>{t.outing}<select value={outing} onChange={(event) => { setOuting(event.target.value); }}><option value="">{t.none}</option>{state.entities.filter((entry) => entry.kind === 'outing' && !entry.deleted).map((entry) => entry.kind === 'outing' && <option key={entry.id} value={entry.id}>{entry.data.title ?? new Date(entry.data.started_at).toLocaleString()}</option>)}</select></label>
    <p className="bn-journal__muted">{t.locationHelp}</p><label>{t.latitude}<input type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => { setLatitude(event.target.value); }} /></label>
    <label>{t.longitude}<input type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => { setLongitude(event.target.value); }} /></label>
    <label>{t.note}<textarea value={note} maxLength={JOURNAL_NOTE_LIMIT} onChange={(event) => { setNote(event.target.value); }} /></label>
    <p>{t.photoLocal}</p><label>{t.photo}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPhoto(event.target.files?.[0] ?? null); }} /></label>
    {row && state.owner && <><ObservationImage owner={state.owner} id={row.id} /><Button variant="quiet" disabled={state.busy} onClick={() => { void state.run(() => deletePhoto(row.owner, row.id), false); }}>{t.removePhoto}</Button></>}
    <Button type="submit" disabled={state.busy}>{t.save}</Button>
    {row && <><Button variant="quiet" onClick={() => { setConfirm(!confirm); }}>{t.remove}</Button>{confirm && <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(async () => { await deleteEntity(row.owner, 'observation', row.id); await deletePhoto(row.owner, row.id); navigateTo({ name: 'observations' }); }); }}>{t.confirmDelete}</Button>}</>}
  </form>;
}
export default function ObservationsPage({ id }: { readonly id?: string }): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const state = useJournal(); const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.entities.filter((entry): entry is EntityRecord<'observation'> => entry.kind === 'observation' && (!entry.deleted || entry.conflict)).sort((a, b) => b.data.observed_at.localeCompare(a.data.observed_at));
  const selected = id ? rows.find((row) => row.id === id) : undefined;
  return <Page width="narrow" className="bn-journal"><PageHeader title={t.observations} back={{ href: routeHash({ name: 'journal' }), label: t.back }} /><JournalLinks /><JournalNotices state={state} />
    {(!id || selected) && <ObservationForm key={`${id ?? 'new'}:${String(selected?.version ?? 0)}`} row={selected} state={state} />}
    {selected && <EntityStatus row={selected} state={state} />}
    {id && <Button variant="secondary" href={routeHash({ name: 'observations' })}>{t.newObservation}</Button>}
    {state.ready && !rows.length && <p>{t.empty}</p>}<ul className="bn-journal__list">{rows.slice(0, limit).map((row) => <li className="bn-journal__card" key={row.id}>
      <h2><a href={routeHash({ name: 'observations', id: row.id })}>{row.data.species}</a></h2><p>{t.manual} · {new Date(row.data.observed_at).toLocaleString(locale)}</p><EntityStatus row={row} state={state} />
    </li>)}</ul>{rows.length > limit && <Button variant="secondary" onClick={() => { setLimit(limit + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
  </Page>;
}
