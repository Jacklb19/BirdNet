import { useMemo, useState } from 'react';
import { navigateTo, routeHash, type OutingFilter } from '../../app/routes';
import { useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { TabLinks } from '../../shared/ui/TabLinks';
import { formatDayTime } from '../log/logFormat';
import { useWalkList } from '../walk/useWalks';
import { WalkItem } from '../walk/WalkItem';
import { journalMessages } from './i18n';
import { JOURNAL_NAME_LIMIT, JOURNAL_NOTE_LIMIT, JOURNAL_PAGE_SIZE } from './journal.config';
import { JournalNotices } from './JournalParts';
import { saveEntity } from './journalStore';
import { outingList } from './outingList';
import type { EntityRecord, OutingData } from './types';
import { useJournal } from './useJournal';
import { cleanName, cleanNote } from './validation';
import '../walk/WalkItem.css';
import './Journal.css';

const KIND_ICONS: Readonly<Record<OutingData['kind'], IconName>> = { walk: 'walk', stationary: 'listen', import: 'download' };

function OutingItem({ row, now }: { readonly row: EntityRecord<'outing'>; readonly now: Date }): React.JSX.Element {
  const { locale } = useI18n();
  const t = journalMessages[locale];
  const started = Date.parse(row.data.started_at);
  const title = row.data.title ?? formatDayTime(started, now, locale);
  const state = row.conflict ? t.conflictShort : row.data.ended_at === null && row.data.kind !== 'import' ? t.inProgress : row.dirty ? t.local : null;
  return (
    <a className="bn-walks__item" href={routeHash({ name: 'outing', id: row.id })}>
      <span className="bn-walks__icon" aria-hidden="true"><Icon name={KIND_ICONS[row.data.kind]} /></span>
      <span className="bn-walks__text">
        <span className="bn-walks__name">{title}</span>
        {row.data.title !== null && <span className="bn-walks__detail">{formatDayTime(started, now, locale)}</span>}
        <span className="bn-walks__detail">{t[row.data.kind]}</span>
        {state && <span className="bn-walks__where">{state}</span>}
      </span>
      <Icon name="chevron" size="s" />
    </a>
  );
}

/** A new outing at one spot, written by hand; listening from it and its observations come on its own page. */
function NewOuting({ state }: { readonly state: ReturnType<typeof useJournal> }): React.JSX.Element {
  const t = journalMessages[useI18n().locale];
  const [title, setTitle] = useState(''); const [note, setNote] = useState('');
  return (
    <details className="bn-journal__disclosure">
      <summary className="bn-journal__summary"><Icon name="plus" size="s" /><span>{t.newOuting}</span></summary>
      <form className="bn-journal__form" onSubmit={(event) => {
        event.preventDefault(); const owner = state.owner; if (!owner) return;
        void state.run(async () => {
          const id = await saveEntity(owner, 'outing', { title: cleanName(title) || null, note: cleanNote(note), kind: 'stationary', started_at: new Date().toISOString(), ended_at: null, site_id: null, walk_id: null });
          navigateTo({ name: 'outing', id });
        });
      }}>
        <p className="bn-journal__muted">{t.newOutingHelp}</p>
        <label>{t.titleLabel}<input value={title} maxLength={JOURNAL_NAME_LIMIT} onChange={(event) => { setTitle(event.target.value); }} /></label>
        <label>{t.note}<textarea value={note} maxLength={JOURNAL_NOTE_LIMIT} onChange={(event) => { setNote(event.target.value); }} /></label>
        <Button type="submit" disabled={state.busy}>{t.create}</Button>
      </form>
    </details>
  );
}

/**
 * The outings part of the log (ADR-35, ADR-46, ADR-47): every time the person went out, newest first. Walks saved
 * before the journal existed are listed as walks; one that an outing names is shown once, through that outing.
 */
export function OutingsPart({ kind }: { readonly kind: OutingFilter }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const t = journalMessages[locale];
  const state = useJournal();
  const walks = useWalkList();
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const now = new Date();
  const outings = useMemo(() => state.entities.filter((row): row is EntityRecord<'outing'> => row.kind === 'outing' && (!row.deleted || row.conflict)), [state.entities]);
  const items = useMemo(() => outingList(outings, walks.walks ?? [], kind), [outings, walks.walks, kind]);
  const walkNote = walks.account === 'error' ? dict.walk.accountError : walks.account === 'offline' ? dict.walk.accountOffline : null;
  const loading = !state.ready || walks.walks === null;
  const more = items.length > limit || walks.hasMore;
  return (
    <div className="bn-journal">
      <TabLinks variant="chips" label={t.outingsFilter.label} links={(['all', 'walk', 'stationary', 'import'] as const).map((value) => ({
        key: value, label: t.outingsFilter[value], current: kind === value,
        href: routeHash(value === 'all' ? { name: 'log', tab: 'outings' } : { name: 'log', tab: 'outings', kind: value }),
      }))} />
      <NewOuting state={state} />
      <JournalNotices state={state} />
      {walkNote && <Notice tone="caution" icon={walks.account === 'offline' ? 'offline' : undefined}>{walkNote}</Notice>}
      {loading && <p className="bn-journal__muted" role="status">{dict.common.loading}</p>}
      {!loading && !items.length && (kind === 'all'
        ? <EmptyState icon="walk" title={t.outingsEmpty} action={<Button icon="walk" href={routeHash({ name: 'map' })}>{dict.walk.empty.action}</Button>}>{t.outingsHelp}</EmptyState>
        : <p className="bn-journal__muted">{t.outingsFilterEmpty}</p>)}
      {items.length > 0 && (
        <ul className="bn-walks__list">
          {items.slice(0, limit).map((item) => (
            <li key={item.kind === 'outing' ? item.row.id : item.walk.id}>
              {item.kind === 'outing' ? <OutingItem row={item.row} now={now} /> : <WalkItem walk={item.walk} now={now} />}
            </li>
          ))}
        </ul>
      )}
      {more && (
        <Button variant="secondary" block aria-busy={walks.loadingMore} onClick={() => {
          setLimit((value) => value + JOURNAL_PAGE_SIZE);
          if (walks.hasMore && items.length <= limit + JOURNAL_PAGE_SIZE) walks.loadMore();
        }}>{walks.loadingMore ? dict.common.loading : t.showMore}</Button>
      )}
    </div>
  );
}
