import { useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { journalMessages } from './i18n';
import { EntityStatus, JournalLinks, JournalNotices } from './JournalParts';
import { saveEntity } from './journalStore';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import './Journal.css';

export default function JournalPage(): React.JSX.Element {
  const { locale } = useI18n(); const t = journalMessages[locale];
  const state = useJournal();
  const [title, setTitle] = useState(''); const [note, setNote] = useState('');
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.entities.filter((row) => row.kind === 'outing' && (!row.deleted || row.conflict)).sort((a, b) => a.kind === 'outing' && b.kind === 'outing' ? b.data.started_at.localeCompare(a.data.started_at) || a.id.localeCompare(b.id) : 0);
  return <Page width="narrow" className="bn-journal"><PageHeader title={t.title} subtitle={t.intro} /><JournalLinks /><JournalNotices state={state} />
    <form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); if (!state.owner) return; void state.run(async () => {
      await saveEntity(state.owner ?? '', 'outing', { title: cleanName(title) || null, note: cleanNote(note), kind: 'stationary', started_at: new Date().toISOString(), ended_at: null, site_id: null, walk_id: null });
      setTitle(''); setNote('');
    }); }}><h2>{t.newOuting}</h2><label>{t.titleLabel}<input value={title} maxLength={JOURNAL_NAME_LIMIT} onChange={(event) => { setTitle(event.target.value); }} /></label>
      <label>{t.note}<textarea value={note} maxLength={JOURNAL_NOTE_LIMIT} onChange={(event) => { setNote(event.target.value); }} /></label><Button type="submit" disabled={state.busy}>{t.create}</Button>
    </form>
    {state.ready && !state.busy && !rows.length && <p>{t.empty}</p>}<ul className="bn-journal__list">{rows.slice(0, limit).map((row) => row.kind === 'outing' && <li className="bn-journal__card" key={row.id}>
      <h2><a href={routeHash({ name: 'outing', id: row.id })}>{row.data.title ?? new Date(row.data.started_at).toLocaleString(locale)}</a></h2>
      <p>{t[row.data.kind]} · {new Date(row.data.started_at).toLocaleString(locale)}{row.data.ended_at ? ` — ${new Date(row.data.ended_at).toLocaleString(locale)}` : ` · ${t.end}`}</p>
      <EntityStatus row={row} state={state} />
    </li>)}</ul>{rows.length > limit && <Button variant="secondary" onClick={() => { setLimit((value) => value + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}</Page>;
}
