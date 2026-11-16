import { useMemo, useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useLogRecords } from '../log/useLogRecords';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalLinks, JournalNotices, type JournalState } from './JournalParts';
import { deleteEntity, saveEntity, setRelation } from './journalStore';
import { Timeline } from './Timeline';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import './Journal.css';

function CollectionForm({ row, state }: { readonly row?: EntityRecord<'collection'>; readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale]; const [name, setName] = useState(row?.data.name ?? ''); const [note, setNote] = useState(row?.data.note ?? ''); const [confirm, setConfirm] = useState(false);
  return <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); if (!state.owner) return; void state.run(async () => {
    const id = await saveEntity(state.owner ?? '', 'collection', { name: cleanName(name), note: cleanNote(note) }, row?.id); navigateTo({ name: 'collections', id });
  }); }}><h2>{row ? t.edit : t.newCollection}</h2><label>{t.name}<input required maxLength={JOURNAL_NAME_LIMIT} value={name} onChange={(event) => { setName(event.target.value); }} /></label>
    <label>{t.note}<textarea maxLength={JOURNAL_NOTE_LIMIT} value={note} onChange={(event) => { setNote(event.target.value); }} /></label><Button type="submit" disabled={state.busy}>{t.save}</Button>
    {row && <><Button variant="quiet" onClick={() => { setConfirm(!confirm); }}>{t.remove}</Button>{confirm && <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(async () => { await deleteEntity(row.owner, 'collection', row.id); navigateTo({ name: 'collections' }); }); }}>{t.confirmDelete}</Button>}</>}
  </form>;
}
function CollectionItems({ row, state }: { readonly row: EntityRecord<'collection'>; readonly state: JournalState }): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const names = useSpeciesNames(); const records = useLogRecords().everything;
  const [search, setSearch] = useState(''); const [record, setRecord] = useState('');
  const candidates = useMemo(() => [
    ...(records ?? []).map((entry) => ({ id: entry.id, species: entry.species, kind: 'detection' as const, at: entry.recordedAt })),
    ...state.entities.filter((entry) => entry.kind === 'observation' && !entry.deleted).flatMap((entry) => entry.kind === 'observation' ? [{ id: entry.id, species: entry.data.species, kind: 'observation' as const, at: Date.parse(entry.data.observed_at) }] : []),
  ].filter((entry) => `${entry.species} ${commonName(names, entry.species, locale)}`.toLocaleLowerCase(locale).includes(search.toLocaleLowerCase(locale))).sort((a, b) => b.at - a.at).slice(0, JOURNAL_PAGE_SIZE), [records, state.entities, search, names, locale]);
  const links = state.relations.filter((entry) => entry.kind === 'collectionItem' && entry.parent === row.id && entry.present);
  return <><form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); const candidate = candidates.find((entry) => `${entry.kind}:${entry.id}` === record); if (!candidate) return;
    void state.run(() => setRelation(row.owner, 'collectionItem', row.id, candidate.id, true, candidate.kind));
  }}><label>{t.chooseSpecies}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
    <label>{t.record}<select required value={record} onChange={(event) => { setRecord(event.target.value); }}><option value="">{t.none}</option>{candidates.map((entry) => <option key={`${entry.kind}:${entry.id}`} value={`${entry.kind}:${entry.id}`}>{commonName(names, entry.species, locale)} · {entry.kind === 'detection' ? t.detection : t.manual} · {new Date(entry.at).toLocaleString(locale)}</option>)}</select></label>
    <Button type="submit" disabled={state.busy || !record}>{t.add}</Button></form>
    <ul className="bn-journal__list">{links.map((link) => {
      const candidate = candidates.find((entry) => entry.id === link.recordId && entry.kind === link.recordKind);
      const species = link.event?.species ?? candidate?.species;
      return <li key={link.key} className="bn-journal__card"><a href={routeHash(link.recordKind === 'detection' ? { name: 'detection', id: link.recordId } : { name: 'observations', id: link.recordId })}>{link.recordKind === 'detection' ? t.detection : t.manual}{species ? ` · ${commonName(names, species, locale)}` : ''}</a>
        <Button variant="quiet" disabled={state.busy} onClick={() => { void state.run(() => setRelation(row.owner, 'collectionItem', row.id, link.recordId, false, link.recordKind)); }}>{t.removeItem}</Button></li>;
    })}</ul>
    <Timeline kind="collection" id={row.id} state={state} /></>;
}
export default function CollectionsPage({ id }: { readonly id?: string }): React.JSX.Element {
  const t = journalMessages[useI18n().locale]; const state = useJournal(); const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.entities.filter((entry): entry is EntityRecord<'collection'> => entry.kind === 'collection' && (!entry.deleted || entry.conflict));
  const row = rows.find((entry) => entry.id === id);
  return <Page width="narrow" className="bn-journal"><PageHeader title={row?.data.name ?? t.collections} subtitle={t.collectionHelp} back={{ href: routeHash({ name: 'journal' }), label: t.back }} /><JournalLinks /><JournalNotices state={state} />
    {(!id || row) && <CollectionForm key={`${row?.id ?? 'new'}:${String(row?.version ?? 0)}`} row={row} state={state} />}{row && <><EntityStatus row={row} state={state} /><CollectionItems row={row} state={state} /><Button href={routeHash({ name: 'collections' })} variant="secondary">{t.newCollection}</Button></>}
    <ul className="bn-journal__list">{rows.slice(0, limit).map((entry) => <li className="bn-journal__card" key={entry.id}><h2><a href={routeHash({ name: 'collections', id: entry.id })}>{entry.data.name}</a></h2><EntityStatus row={entry} state={state} /></li>)}</ul>
    {state.ready && !state.busy && !rows.length && <p>{t.empty}</p>}{rows.length > limit && <Button variant="secondary" onClick={() => { setLimit(limit + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
  </Page>;
}
