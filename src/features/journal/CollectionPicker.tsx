import { useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { journalMessages } from './i18n';
import { JournalNotices } from './JournalParts';
import { setRelation } from './journalStore';
import { useJournal } from './useJournal';

export function CollectionPicker({ id }: { readonly id: string }): React.JSX.Element | null {
  const t = journalMessages[useI18n().locale]; const state = useJournal(); const [collection, setCollection] = useState('');
  const rows = state.entities.filter((row) => row.kind === 'collection' && !row.deleted);
  if (!state.owner) return null;
  return <section><form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); if (collection && state.owner) void state.run(() => setRelation(state.owner ?? '', 'collectionItem', collection, id, true)); }}>
    <label>{t.collections}<select value={collection} required onChange={(event) => { setCollection(event.target.value); }}><option value="">{t.none}</option>{rows.map((row) => row.kind === 'collection' && <option key={row.id} value={row.id}>{row.data.name}</option>)}</select></label><Button type="submit" disabled={state.busy || !collection}>{t.add}</Button>
  </form><JournalNotices state={state} /></section>;
}
