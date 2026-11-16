import { useState } from 'react';
import { navigateTo, routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon } from '../../shared/ui/Icon';
import { journalMessages } from './i18n';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { JournalNotices } from './JournalParts';
import { saveEntity } from './journalStore';
import type { EntityRecord } from './types';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import '../walk/WalkItem.css';
import './Journal.css';

/** The collections part of the log (ADR-46, ADR-47): the person's groups of records, and a new one opened in place. */
export function CollectionsPart(): React.JSX.Element {
  const { locale } = useI18n();
  const t = journalMessages[locale];
  const state = useJournal();
  const [name, setName] = useState(''); const [note, setNote] = useState('');
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const rows = state.entities.filter((entry): entry is EntityRecord<'collection'> => entry.kind === 'collection' && (!entry.deleted || entry.conflict))
    .sort((a, b) => a.data.name.localeCompare(b.data.name, locale));
  return (
    <div className="bn-journal">
      <details className="bn-journal__disclosure" open={(state.ready && !rows.length) || undefined}>
        <summary className="bn-journal__summary"><Icon name="plus" size="s" /><span>{t.newCollection}</span></summary>
        <form className="bn-journal__form" onSubmit={(event) => {
          event.preventDefault(); const owner = state.owner; if (!owner) return;
          void state.run(async () => { const id = await saveEntity(owner, 'collection', { name: cleanName(name), note: cleanNote(note) }); navigateTo({ name: 'collection', id }); });
        }}>
          <p className="bn-journal__muted">{t.collectionHelp}</p>
          <label>{t.name}<input required maxLength={JOURNAL_NAME_LIMIT} value={name} onChange={(event) => { setName(event.target.value); }} /></label>
          <label>{t.note}<textarea maxLength={JOURNAL_NOTE_LIMIT} value={note} onChange={(event) => { setNote(event.target.value); }} /></label>
          <Button type="submit" disabled={state.busy}>{t.create}</Button>
        </form>
      </details>
      <JournalNotices state={state} />
      {state.ready && !rows.length && <EmptyState icon="album" title={t.collectionsEmpty}>{t.collectionHelp}</EmptyState>}
      {rows.length > 0 && (
        <ul className="bn-walks__list">
          {rows.slice(0, limit).map((row) => (
            <li key={row.id}>
              <a className="bn-walks__item" href={routeHash({ name: 'collection', id: row.id })}>
                <span className="bn-walks__icon" aria-hidden="true"><Icon name="album" /></span>
                <span className="bn-walks__text">
                  <span className="bn-walks__name">{row.data.name}</span>
                  {row.data.note && <span className="bn-walks__detail">{row.data.note}</span>}
                  {row.conflict ? <span className="bn-walks__where">{t.conflictShort}</span> : row.dirty && <span className="bn-walks__where">{t.local}</span>}
                </span>
                <Icon name="chevron" size="s" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && <Button variant="secondary" block onClick={() => { setLimit((value) => value + JOURNAL_PAGE_SIZE); }}>{t.showMore}</Button>}
    </div>
  );
}
