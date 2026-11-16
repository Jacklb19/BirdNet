import { useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useListening } from '../listen/listeningContext';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalNotices, type JournalState } from './JournalParts';
import { deleteEntity, saveEntity } from './journalStore';
import { chooseOuting } from './outingSession';
import { Timeline } from './Timeline';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import './Journal.css';

function OutingForm({ row, state }: { readonly row: EntityRecord<'outing'>; readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  const [title, setTitle] = useState(row.data.title ?? ''); const [note, setNote] = useState(row.data.note ?? '');
  return <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); void state.run(() => saveEntity(row.owner, 'outing', { ...row.data, title: cleanName(title) || null, note: cleanNote(note) }, row.id)); }}>
    <label>{t.titleLabel}<input value={title} onChange={(event) => { setTitle(event.target.value); }} maxLength={JOURNAL_NAME_LIMIT} /></label>
    <label>{t.note}<textarea value={note} onChange={(event) => { setNote(event.target.value); }} maxLength={JOURNAL_NOTE_LIMIT} /></label>
    <Button type="submit" disabled={state.busy}>{t.save}</Button>
  </form>;
}
export default function OutingPage({ id }: { readonly id: string }): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale]; const state = useJournal(); const listening = useListening(); const [confirm, setConfirm] = useState(false);
  const row = state.entities.find((entry) => entry.kind === 'outing' && entry.id === id && (!entry.deleted || entry.conflict));
  return <Page width="narrow" className="bn-journal"><PageHeader title={row?.kind === 'outing' ? row.data.title ?? new Date(row.data.started_at).toLocaleString(locale) : t.title} back={{ href: routeHash({ name: 'journal' }), label: t.back }} /><JournalNotices state={state} />
    {row?.kind === 'outing' ? <><EntityStatus row={row} state={state} />
      <OutingForm key={`${row.id}:${String(row.version ?? 0)}`} row={row} state={state} />
      {row.data.kind === 'stationary' && !listening.active && <Button onClick={() => { chooseOuting(row.owner, row.id); void listening.start().then(() => { navigateTo({ name: 'listen' }); }); }}>{t.start}</Button>}
      <Timeline kind="outing" id={id} state={state} />
      <Notice tone="info">{t.deleteOuting}</Notice><Button variant="quiet" onClick={() => { setConfirm(!confirm); }}>{t.remove}</Button>
      {confirm && <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(() => deleteEntity(row.owner, 'outing', id)).then((ok) => { if (ok) navigateTo({ name: 'journal' }); }); }}>{t.confirmDelete}</Button>}
    </> : state.ready && !state.busy && <p>{t.empty}</p>}
  </Page>;
}
