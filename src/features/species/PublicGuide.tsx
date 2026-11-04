import { useId, useMemo, useState } from 'react';
import { routeHash } from '../../app/routes';
import { useIsDesktop } from '../../config/layout';
import { formatCount, formatNumber, useI18n } from '../../i18n';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Notice';
import { Page } from '../../shared/ui/Page';
import { PageHeader } from '../../shared/ui/PageHeader';
import { albumPage, matchesSearch } from './album';
import { AlbumBook, BookCard, type BookSlot } from './AlbumBook';
import { usePlumage } from './plumage';
import { ALBUM_PAGE_SLOTS } from './species.config';
import { commonName, useSpeciesNames } from './speciesNames';
import { useRegionCatalog } from './speciesPhotos';
import './AlbumPage.css';

/** The right page of the open book: the chosen bird and the way to its card. */
function ChosenCard({ species, name }: { readonly species: string; readonly name: string }): React.JSX.Element {
  const { dict } = useI18n();
  const texts = dict.species.publicGuide;
  const plumage = usePlumage(species);
  return (
    <BookCard eyebrow={texts.cardEyebrow} title={name} species={species} name={name} plumage={plumage} facts={[]}>
      <p className="bn-album__muted">{texts.cardText}</p>
      <Button variant="secondary" icon="book" href={routeHash({ name: 'species', species })}>{dict.species.album.book.open}</Button>
    </BookCard>
  );
}

/**
 * The guide without a session (ADR-45): the birds of the region as a book anyone can leaf through, each leading to
 * its public card. It shows nothing of anyone's records, and invites to an account to fill one's own album.
 */
export function PublicGuide(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const texts = dict.species.publicGuide;
  const album = dict.species.album;
  const names = useSpeciesNames();
  const catalog = useRegionCatalog();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<string | null>(null);
  const searchId = useId();
  const bookId = useId();

  // Alphabetical by the name the reader sees, so the book reads like a printed guide.
  const birds = useMemo(() => (catalog ?? [])
    .map((species) => ({ species, name: commonName(names, species, locale) }))
    .filter((bird) => matchesSearch(query, bird.species, bird.name))
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [catalog, names, locale, query]);
  const view = albumPage(birds, page, isDesktop ? ALBUM_PAGE_SLOTS.desktop : ALBUM_PAGE_SLOTS.phone);
  const selected = view.slots.find((bird) => bird.species === chosen) ?? view.slots[0] ?? null;
  const turnTo = (next: number): void => { setPage(next); setChosen(null); };

  const slots: BookSlot[] = view.slots.map((bird) => ({
    species: bird.species, name: bird.name, found: true, note: bird.species,
    ...(isDesktop
      ? { onSelect: () => { setChosen(bird.species); }, selected: bird.species === selected?.species }
      : { href: routeHash({ name: 'species', species: bird.species }) }),
  }));

  return (
    <Page className="bn-album">
      <PageHeader title={texts.title} subtitle={catalog ? formatCount(texts.subtitle, catalog.length, locale) : undefined} />

      <div className="bn-album__search">
        <label htmlFor={searchId} className="visually-hidden">{album.search}</label>
        <Icon name="search" size="s" />
        <input id={searchId} type="search" className="bn-album__search-input" placeholder={album.searchPlaceholder} value={query}
          autoComplete="off" spellCheck={false} onChange={(event) => { setQuery(event.target.value); turnTo(1); }} />
      </div>

      <section aria-labelledby={bookId}>
        <AlbumBook titleId={bookId} eyebrow={texts.page(formatNumber(view.page, locale), formatNumber(view.pages, locale))}
          title={texts.onPage(formatNumber(view.slots.length, locale))} slots={slots} leaf={`${String(view.page)}:${query}`}
          empty={<p className="bn-album__muted">{catalog === null ? dict.common.loading : album.noMatches}</p>}
          footer={view.pages > 1 ? (
            <>
              <Button variant="quiet" icon="back" disabled={view.page <= 1} onClick={() => { turnTo(view.page - 1); }}>{album.book.previous}</Button>
              <Button variant="quiet" icon="chevron" disabled={view.page >= view.pages} onClick={() => { turnTo(view.page + 1); }}>{album.book.next}</Button>
            </>
          ) : undefined}
          right={isDesktop && selected ? <ChosenCard species={selected.species} name={selected.name} /> : undefined} />
      </section>

      <Notice icon="album" title={texts.join.title} action={<Button href={routeHash({ name: 'signUp' })}>{texts.join.action}</Button>}>
        {texts.join.text}
      </Notice>
      <p className="bn-album__muted">{dict.common.absenceCaveat}</p>
    </Page>
  );
}
