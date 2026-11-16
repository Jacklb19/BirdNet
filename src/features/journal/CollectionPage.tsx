import { useId, useMemo, useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useLogRecords } from '../log/useLogRecords';
import { commonName, useSpeciesNames } from '../species/speciesNames';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalNotices, type JournalState } from './JournalParts';
import { deleteEntity, saveEntity, setRelation } from './journalStore';
import { Timeline } from './Timeline';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import './Journal.css';

/** Name and note of a collection, and deleting it; opened in place so the collection's records stay first. */
function CollectionForm({ row, state }: { readonly row: EntityRecord<'collection'>; readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale]; const [name, setName] = useState(row.data.name); const [note, setNote] = useState(row.data.note ?? ''); const [confirm, setConfirm] = useState(false);
  return (
    <details className="bn-journal__disclosure">
      <summary className="bn-journal__summary"><Icon name="settings" size="s" /><span>{t.edit}</span></summary>
      <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); void state.run(() => saveEntity(row.owner, 'collection', { name: cleanName(name), note: cleanNote(note) }, row.id)); }}>
        <label>{t.name}<input required maxLength={JOURNAL_NAME_LIMIT} value={name} onChange={(event) => { setName(event.target.value); }} /></label>
        <label>{t.note}<textarea maxLength={JOURNAL_NOTE_LIMIT} value={note} onChange={(event) => { setNote(event.target.value); }} /></label>
        <div className="bn-journal__actions">
          <Button type="submit" disabled={state.busy}>{t.save}</Button>
          <Button variant="quiet" onClick={() => { setConfirm(!confirm); }}>{t.remove}</Button>
          {confirm && <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(async () => { await deleteEntity(row.owner, 'collection', row.id); navigateTo({ name: 'log', tab: 'collections' }); }); }}>{t.confirmDelete}</Button>}
        </div>
      </form>
    </details>
  );
}

/**
 * Adding the person's own records to the collection: a search by species over every song and observation, newest
 * first, shown a page at a time so a record past the first matches is still reachable (audit F04).
 */
function AddRecords({ row, state }: { readonly row: EntityRecord<'collection'>; readonly state: JournalState }): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const names = useSpeciesNames(); const records = useLogRecords().everything;
  const [search, setSearch] = useState(''); const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const searchId = useId();
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const members = useMemo(() => new Set(state.relations.filter((entry) => entry.kind === 'collectionItem' && entry.parent === row.id && entry.present).map((entry) => `${entry.recordKind}:${entry.recordId}`)), [state.relations, row.id]);
  const candidates = useMemo(() => [
    ...(records ?? []).map((entry) => ({ id: entry.id, species: entry.species, kind: 'detection' as const, at: entry.recordedAt })),
    ...state.entities.flatMap((entry) => entry.kind === 'observation' && !entry.deleted ? [{ id: entry.id, species: entry.data.species, kind: 'observation' as const, at: Date.parse(entry.data.observed_at) }] : []),
  ].filter((entry) => !members.has(`${entry.kind}:${entry.id}`) && `${entry.species} ${commonName(names, entry.species, locale)}`.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)), [records, state.entities, search, names, locale, members]);
  return (
    <details className="bn-journal__disclosure" open={members.size === 0 || undefined}>
      <summary className="bn-journal__summary"><Icon name="plus" size="s" /><span>{t.addRecords}</span></summary>
      <div className="bn-journal__form">
        <label htmlFor={searchId}>{t.chooseSpecies}</label>
        <input id={searchId} type="search" value={search} autoComplete="off" onChange={(event) => { setSearch(event.target.value); setLimit(JOURNAL_PAGE_SIZE); }} />
        {candidates.length === 0 ? <p className="bn-journal__muted">{t.noCandidates}</p> : (
          <ul className="bn-journal__rows">
            {candidates.slice(0, limit).map((entry) => {
              const name = commonName(names, entry.species, locale); const kind = entry.kind === 'detection' ? t.detection : t.manual;
              return (
                <li key={`${entry.kind}:${entry.id}`} className="bn-journal__candidate">
                  <span className="bn-journal__candidate-text"><strong>{name}</strong><span className="bn-journal__muted">{kind} · {when.format(new Date(entry.at))}</span></span>
                  <Button variant="secondary" icon="plus" disabled={state.busy} data-record={`${entry.kind}:${entry.id}`} aria-label={`${t.add}: ${name}, ${kind}, ${when.format(new Date(entry.at))}`}
                    onClick={() => { void state.run(() => setRelation(row.owner, 'collectionItem', row.id, entry.id, true, entry.kind)); }}>{t.add}</Button>
                </li>
              );
            })}
          </ul>
        )}
        {candidates.length > limit && <Button variant="secondary" onClick={() => { setLimit((value) => value + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
      </div>
    </details>
  );
}

/** One collection (ADR-46): its records on a timeline, a way to add more, and its name and note. */
export default function CollectionPage({ id }: { readonly id: string }): React.JSX.Element {
  const t = journalMessages[useI18n().locale]; const state = useJournal();
  const row = state.entities.find((entry): entry is EntityRecord<'collection'> => entry.kind === 'collection' && entry.id === id && (!entry.deleted || entry.conflict));
  return (
    <Page width="narrow" className="bn-journal">
      <PageHeader title={row?.data.name ?? t.collections} subtitle={row?.data.note ?? t.collectionHelp}
        back={{ href: routeHash({ name: 'log', tab: 'collections' }), label: t.backTo.collections }} />
      <JournalNotices state={state} />
      {row ? (
        <>
          <EntityStatus row={row} state={state} />
          <AddRecords row={row} state={state} />
          <Timeline kind="collection" id={row.id} state={state}
            onRemove={(event) => { void state.run(() => setRelation(row.owner, 'collectionItem', row.id, event.id, false, event.kind)); }} />
          <CollectionForm key={`${row.id}:${String(row.version ?? 0)}`} row={row} state={state} />
        </>
      ) : state.ready && !state.busy && <p>{t.empty}</p>}
    </Page>
  );
}
