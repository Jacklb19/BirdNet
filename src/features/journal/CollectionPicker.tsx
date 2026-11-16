import { useId, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Dropdown } from '../../shared/ui/Dropdown';
import { journalMessages } from './i18n';
import { JournalNotices } from './JournalParts';
import { setRelation } from './journalStore';
import { useJournal } from './useJournal';

/** Adds one of the person's records to one of their collections, chosen from Trino's own list (ADR-47). */
export function CollectionPicker({ id }: { readonly id: string }): React.JSX.Element | null {
  const t = journalMessages[useI18n().locale]; const state = useJournal(); const [collection, setCollection] = useState('');
  const labelId = useId();
  const rows = state.entities.flatMap((row) => row.kind === 'collection' && !row.deleted ? [{ value: row.id, label: row.data.name }] : []);
  if (!state.owner) return null;
  return <section><form className="bn-journal__form" onSubmit={(event) => { event.preventDefault(); if (collection && state.owner) void state.run(() => setRelation(state.owner ?? '', 'collectionItem', collection, id, true)); }}>
    <div className="bn-journal__field"><span id={labelId}>{t.collections}</span>
      <Dropdown labelId={labelId} value={collection} onChange={setCollection} placeholder={t.none} options={rows} /></div>
    <Button type="submit" disabled={state.busy || !collection}>{t.add}</Button>
  </form><JournalNotices state={state} /></section>;
}
