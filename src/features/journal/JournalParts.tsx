import { useEffect, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Notice';
import { SpeciesPicker } from '../species/SpeciesPicker';
import { useRegionCatalog } from '../species/speciesPhotos';
import { JOURNAL_CHANGED } from './journal.config';
import { journalMessages } from './i18n';
import { getPhoto } from './journalStore';
import { resolveJournalConflict } from './journalSync';
import type { JournalEntity } from './types';
import type { useJournal } from './useJournal';
import './Journal.css';

export type JournalState = ReturnType<typeof useJournal>;
export function JournalLinks(): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  return <nav className="bn-journal__links" aria-label={t.title}>{([
    ['journal', t.title], ['observations', t.observations], ['collections', t.collections], ['wishlist', t.wishlist], ['importAudio', t.importAudio], ['assistant', t.assistant],
  ] as const).map(([name, label]) => <Button key={name} variant="quiet" href={routeHash({ name })}>{label}</Button>)}</nav>;
}
export function JournalNotices({ state }: { readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  return <>{(!state.ready || state.busy) && <p role="status">{t.loading}</p>}{state.error && <Notice tone="error" action={<Button variant="quiet" disabled={state.busy} onClick={() => { void state.refresh(); }}>{t.retry}</Button>}>{t.error}</Notice>}</>;
}
export function EntityStatus({ row, state }: { readonly row: JournalEntity; readonly state: JournalState }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  return row.conflict ? <Notice tone="caution" title={row.remoteDeleted ? t.remoteDeleted : t.conflict} action={<div className="bn-journal__actions">
    <Button variant="secondary" disabled={state.busy} onClick={() => { void state.run(() => resolveJournalConflict(row.owner, row.kind, row.id, 'remote')); }}>{row.remoteDeleted ? t.acceptDeletion : t.useRemote}</Button>
    <Button variant="quiet" disabled={state.busy} onClick={() => { void state.run(() => resolveJournalConflict(row.owner, row.kind, row.id, 'local')); }}>{row.remoteDeleted ? t.copyMetadata : t.useLocal}</Button>
  </div>}>{row.data.note}</Notice> : <p className="bn-journal__muted">{row.dirty ? t.local : t.saved}</p>;
}
/**
 * The species of a journal record: chosen from the catalogue by common or scientific name (ADR-47), with the birds
 * of the region's guide first, since the bird seen is almost always one of them.
 */
export function SpeciesField({ value, onChange, required = true }: { readonly value: string; readonly onChange: (value: string) => void; readonly required?: boolean }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  const catalog = useRegionCatalog();
  const likely = useMemo(() => new Set(catalog ?? []), [catalog]);
  return <SpeciesPicker label={t.species} value={value} onChange={onChange} required={required} likely={likely} />;
}
export function ObservationImage({ owner, id }: { readonly owner: string; readonly id: string }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let current: string | null = null;
    const load = (): void => { void getPhoto(owner, id).then((blob) => {
      if (!active) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : null;
      setUrl(current); setFailed(false);
    }).catch(() => { if (active) setFailed(true); }); };
    load(); window.addEventListener(JOURNAL_CHANGED, load);
    return () => { active = false; if (current) URL.revokeObjectURL(current); window.removeEventListener(JOURNAL_CHANGED, load); };
  }, [owner, id]);
  return <>{url ? <img className="bn-journal__photo" src={url} alt={t.photoAlt} /> : <p className="bn-journal__muted">{failed ? t.error : t.noPhoto}</p>}</>;
}
