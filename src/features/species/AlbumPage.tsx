import { useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useIsDesktop } from '../../config/layout';
import { formatBytes, formatCount, formatDate, formatNumber, formatPercent, formatRelativeTime, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { birdnetWeek } from '../inference/geoFilter';
import { useRegionSpecies } from '../inference/regionSpecies';
import { useLogRecords } from '../log/useLogRecords';
import { useOnline } from '../offline/useQueueStatus';
import { useSites } from '../sites/useSites';
import { ALBUM_SCOPES, albumEntries, albumPage, albumSlots, matchesSearch, type AlbumScope, type AlbumSlot } from './album';
import { AlbumBook, BookCard, type BookFact, type BookSlot } from './AlbumBook';
import { usePlumage, type Plumage } from './plumage';
import { guidePlace, useRegionGuide } from './regionGuide';
import { ALBUM_PAGE_SLOTS, GUIDE_BYTES_PER_SPECIES, GUIDE_MAX_SPECIES } from './species.config';
import { commonName, useSpeciesNames } from './speciesNames';
import { useOwnSpecies } from './useOwnSpecies';
import { useRegionPlace } from './useRegionPlace';
import './AlbumPage.css';

/** Index tabs of the book, each with the plate that colors it. */
const SCOPE_PLUMAGE: Readonly<Record<AlbumScope, Plumage>> = Object.freeze({ all: 'mirla', found: 'canario', missing: 'azulejo' });

/** Whole percent: neither the model's confidence nor the geographic likelihood means anything below that. */
const PERCENT_DIGITS = 0;

/** The right page: what the person has of the chosen bird, or that it is still to find, and the way to its card. */
function SelectedCard({ slot, name, now }: { readonly slot: AlbumSlot; readonly name: string; readonly now: Date }): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.album.book;
  const plumage = usePlumage(slot.species);
  const facts: BookFact[] = slot.found
    ? [
      { value: formatNumber(slot.entry.detections, locale), label: texts.facts.records },
      { value: formatPercent(slot.entry.bestConfidence, locale, PERCENT_DIGITS), label: texts.facts.best },
      { value: formatRelativeTime(new Date(slot.entry.lastAt), now, locale), label: texts.facts.last },
    ]
    : [{ value: formatPercent(slot.probability, locale, PERCENT_DIGITS), label: texts.facts.probability }];
  return (
    <BookCard eyebrow={texts.cardEyebrow} title={slot.found ? texts.cardFound : texts.cardMissing}
      species={slot.species} name={name} plumage={plumage} facts={facts}>
      {!slot.found && <p className="bn-album__muted">{texts.missingText}</p>}
      <Button variant="secondary" icon="book" href={routeHash({ name: 'species', species: slot.species })}>{texts.open}</Button>
    </BookCard>
  );
}

/**
 * Guide (ADR-17, ADR-27): the album as a ring-bound book. Each page holds the stickers of the species recorded
 * (phone and account together) and, faded, the likely birds of the area still to find. The open book shows the
 * card of the chosen bird on its right page; on a phone a sticker opens the bird's own screen.
 */
export default function AlbumPage(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.album;
  const names = useSpeciesNames();
  const online = useOnline();
  const isDesktop = useIsDesktop();
  const { records, readAt } = useLogRecords();
  const cloud = useOwnSpecies();
  const { sites, active } = useSites();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AlbumScope>('all');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<string | null>(null);
  const searchId = useId();
  const bookId = useId();
  const guideId = useId();

  const entries = useMemo(() => albumEntries(records ?? [], cloud), [records, cloud]);
  // The region is the active place's, a saved one's or where the latest song was heard: the album never asks for the device position.
  const site = active ?? sites[0] ?? null;
  const place = useRegionPlace();
  const region = useRegionSpecies(place, birdnetWeek(new Date()), GUIDE_MAX_SPECIES);
  const guide = useRegionGuide(locale);
  const likely = region.status === 'ready' ? region.species : null;

  const slots = useMemo(
    () => albumSlots(entries, likely ?? [], scope).filter((slot) =>
      matchesSearch(query, slot.species, commonName(names, slot.species, locale, slot.found ? undefined : slot.label))),
    [entries, likely, scope, query, names, locale],
  );
  const view = albumPage(slots, page, isDesktop ? ALBUM_PAGE_SLOTS.desktop : ALBUM_PAGE_SLOTS.phone);
  // The right page follows the chosen sticker while it is on this page; otherwise it opens on the page's first bird.
  const selected = view.slots.find((slot) => slot.species === chosen) ?? view.slots[0] ?? null;

  const nameOf = (slot: AlbumSlot): string => commonName(names, slot.species, locale, slot.found ? undefined : slot.label);
  const bookSlots: BookSlot[] = view.slots.map((slot) => ({
    species: slot.species, name: nameOf(slot), found: slot.found,
    note: slot.found ? formatCount(texts.count, slot.entry.detections, locale) : texts.book.toFind,
    // The open book turns its right page; a phone has no right page, so the sticker leads to the bird's screen.
    ...(isDesktop
      ? { onSelect: () => { setChosen(slot.species); }, selected: slot.species === selected?.species }
      : { href: routeHash({ name: 'species', species: slot.species }) }),
  }));
  const foundOnPage = view.slots.filter((slot) => slot.found).length;

  const turnTo = (next: number): void => { setPage(next); setChosen(null); };
  const changeScope = (next: AlbumScope): void => { setScope(next); turnTo(1); };

  return (
    <Page className="bn-album">
      <PageHeader title={texts.title} subtitle={formatCount(texts.subtitle, entries.length, locale)} />

      <div className="bn-album__search">
        <label htmlFor={searchId} className="visually-hidden">{texts.search}</label>
        <Icon name="search" size="s" />
        <input id={searchId} type="search" className="bn-album__search-input" placeholder={texts.searchPlaceholder} value={query}
          autoComplete="off" spellCheck={false} onChange={(event) => { setQuery(event.target.value); turnTo(1); }} />
      </div>

      <section aria-labelledby={bookId}>
        <AlbumBook titleId={bookId}
          eyebrow={texts.book.page(formatNumber(view.page, locale), formatNumber(view.pages, locale))}
          title={texts.book.onPage(formatNumber(foundOnPage, locale), formatNumber(view.slots.length, locale))}
          slots={bookSlots}
          empty={<p className="bn-album__muted">{query.trim() ? texts.noMatches : records === null ? dict.common.loading : texts.book.emptyScope[scope]}</p>}
          tabsLabel={texts.book.scopeLabel}
          tabs={ALBUM_SCOPES.map((value) => ({
            key: value, label: texts.book.scopes[value], plumage: SCOPE_PLUMAGE[value], current: value === scope, onSelect: () => { changeScope(value); },
          }))}
          footer={view.pages > 1 ? (
            <>
              <Button variant="quiet" icon="back" disabled={view.page <= 1} onClick={() => { turnTo(view.page - 1); }}>{texts.book.previous}</Button>
              <Button variant="quiet" icon="chevron" disabled={view.page >= view.pages} onClick={() => { turnTo(view.page + 1); }}>{texts.book.next}</Button>
            </>
          ) : undefined}
          right={isDesktop && selected ? <SelectedCard slot={selected} name={nameOf(selected)} now={readAt} /> : undefined} />
      </section>

      {entries.length === 0 && records !== null && (
        <Notice icon="album" title={texts.empty.title}
          action={<Button variant="quiet" href={routeHash({ name: 'listen' })} icon="listen">{texts.empty.action}</Button>}>
          {texts.empty.text}
        </Notice>
      )}
      {region.status === 'loading' && <p className="bn-album__muted" role="status">{texts.discover.loading}</p>}
      {region.status === 'unavailable' && <p className="bn-album__muted">{texts.discover.unavailable}</p>}
      {region.status === 'ready' && <p className="bn-album__muted">{site ? texts.discover.text(site.name) : texts.discover.textNear}</p>}

      {region.status === 'ready' && region.species.length > 0 && (
        <section className="bn-album__guide" aria-labelledby={guideId}>
          <span className="bn-album__guide-icon" aria-hidden="true"><Icon name="download" /></span>
          <div className="bn-album__guide-body">
            <h2 id={guideId} className="bn-album__guide-title">{texts.guide.title}</h2>
            <p>{texts.guide.text(formatNumber(region.species.length, locale), formatBytes(region.species.length * GUIDE_BYTES_PER_SPECIES, locale))}</p>
            {guide.saved && guide.progress.status === 'idle' && (
              <p className="bn-album__muted">{texts.guide.savedBefore(formatNumber(guide.saved.species, locale), formatDate(new Date(guide.saved.savedAt), locale))}</p>
            )}
            {guide.progress.status === 'saving' && (
              <p role="status">{texts.guide.saving(formatNumber(guide.progress.done, locale), formatNumber(guide.progress.total, locale))}</p>
            )}
            {guide.progress.status === 'saved' && (
              <Notice tone="success" icon="check" live>
                <p>{texts.guide.saved(formatNumber(guide.progress.saved, locale))}</p>
                {guide.progress.failed > 0 && <p>{texts.guide.partial(formatNumber(guide.progress.failed, locale))}</p>}
              </Notice>
            )}
            {!online && <p className="bn-album__muted">{texts.guide.offline}</p>}
            <Button variant="secondary" icon="download" aria-disabled={!online || guide.progress.status === 'saving'}
              aria-busy={guide.progress.status === 'saving'}
              onClick={() => { if (online && guide.progress.status !== 'saving') void guide.save(guidePlace(place), region.species); }}>
              {guide.saved?.place === guidePlace(place) ? texts.guide.update : texts.guide.save}
            </Button>
          </div>
        </section>
      )}

      <p className="bn-album__muted">{dict.common.absenceCaveat}</p>
    </Page>
  );
}
