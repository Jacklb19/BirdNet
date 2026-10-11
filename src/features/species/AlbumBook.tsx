import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Sticker } from '../../shared/ui/Sticker';
import type { Plumage } from './plumage';
import { ALBUM_BOOK_RINGS, BOOK_SEEN_RATIO } from './species.config';
import './AlbumBook.css';

/** One place for a sticker on the album's page: pasted in, or still to find. */
export interface BookSlot {
  /** Scientific name. */
  readonly species: string;
  readonly name: string;
  readonly found: boolean;
  /** Small line under the name: how often it was heard, or that it is still to find. */
  readonly note: string;
  /** Where the sticker leads; a slot with `onSelect` acts in place instead (it turns the right page to that bird). */
  readonly href?: string;
  readonly onSelect?: () => void;
  readonly selected?: boolean;
}

/** An index tab on the edge of the book. */
export interface BookTab {
  readonly key: string;
  readonly label: string;
  readonly plumage: Plumage;
  readonly current?: boolean;
  readonly onSelect: () => void;
}

export interface AlbumBookProps {
  /** Notebook line above the page title ("Page 1 · Bogotá"). */
  readonly eyebrow: string;
  readonly title: string;
  /** Id of the title, so the section that holds the book can be labelled by it. */
  readonly titleId?: string;
  readonly slots: readonly BookSlot[];
  /** Changes when another leaf is shown (page, tab, search): the page then turns and its stickers land again. */
  readonly leaf?: string;
  /** Shown in place of the slots when the page has none (an empty album, a search without matches). */
  readonly empty?: ReactNode;
  /** Under the stickers: turning the page. */
  readonly footer?: ReactNode;
  /** The right page; without it the book is a single page (phones, where a sticker opens its own screen). */
  readonly right?: ReactNode;
  readonly tabs?: readonly BookTab[];
  readonly tabsLabel?: string;
}

function Slot({ slot, order }: { readonly slot: BookSlot; readonly order: number }): React.JSX.Element {
  const content = (
    <>
      <Sticker scientificName={slot.species} alt="" size="s" missing={!slot.found} drop={slot.found} order={order} />
      <span className="bn-book__slot-name">{slot.name}</span>
      <span className="label bn-book__slot-note">{slot.note}</span>
    </>
  );
  const className = `bn-book__slot${slot.selected ? ' bn-book__slot--selected' : ''}`;
  if (slot.onSelect) return <button type="button" className={className} aria-pressed={slot.selected ?? false} onClick={slot.onSelect}>{content}</button>;
  return slot.href ? <a className={className} href={slot.href}>{content}</a> : <span className={className}>{content}</span>;
}

/**
 * The album as a ring-bound book (ADR-20, ADR-27): a page of stickers on the left, the card of one bird on the
 * right, rings on the spine and index tabs on the edge. Wide screens show it open; on phones it is one page with
 * the rings along its top and the tabs above it. The home page shows an example of it; Guide is the real one.
 */
export function AlbumBook({ eyebrow, title, titleId, slots, leaf = '', empty, footer, right, tabs, tabsLabel }: AlbumBookProps): React.JSX.Element {
  const book = useRef<HTMLDivElement>(null);
  // The stickers wait for the book to come into view, so the pasting is seen and not spent above the fold.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = book.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setSeen(true);
      observer.disconnect();
    }, { threshold: BOOK_SEEN_RATIO });
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, []);
  return (
    <div ref={book} className={`bn-book${right ? ' bn-book--open' : ''}${seen ? ' bn-book--seen' : ''}`}>
      {tabs && tabs.length > 0 && (
        <div className="bn-book__tabs" role="group" aria-label={tabsLabel}>
          {tabs.map((tab) => (
            <button key={tab.key} type="button" className="bn-book__tab label" aria-pressed={tab.current ?? false} onClick={tab.onSelect}
              style={{ '--plate': `var(--plumage-${tab.plumage})`, '--on-plate': `var(--plumage-${tab.plumage}-on)` } as CSSProperties}>
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="bn-book__cover">
        <div className="bn-book__page">
          <p className="label bn-book__eyebrow">{eyebrow}</p>
          <h2 id={titleId} className="bn-book__title display">{title}</h2>
          {slots.length > 0
            ? <ul key={leaf} className="bn-book__slots">{slots.map((slot, index) => <li key={slot.species}><Slot slot={slot} order={index} /></li>)}</ul>
            : empty}
          {footer && <div className="bn-book__footer">{footer}</div>}
        </div>
        <div className="bn-book__spine" aria-hidden="true">
          {Array.from({ length: ALBUM_BOOK_RINGS }, (_, ring) => <span key={ring} className="bn-book__ring" />)}
        </div>
        {right && <div className="bn-book__page bn-book__page--right">{right}</div>}
      </div>
    </div>
  );
}

/** A figure of a bird's card: the value large, what it measures small underneath. */
export interface BookFact { readonly value: string; readonly label: string }

export interface BookCardProps {
  readonly eyebrow: string;
  readonly title: string;
  /** Scientific name. */
  readonly species: string;
  readonly name: string;
  readonly plumage: Plumage;
  /** One line about the bird on its plate. */
  readonly line?: string;
  readonly facts: readonly BookFact[];
  readonly children?: ReactNode;
}

/** The right page of the book: the plate of one bird with a few figures about it. */
export function BookCard({ eyebrow, title, species, name, plumage, line, facts, children }: BookCardProps): React.JSX.Element {
  const plate = { '--plate': `var(--plumage-${plumage})`, '--on-plate': `var(--plumage-${plumage}-on)` } as CSSProperties;
  return (
    <>
      <p className="label bn-book__eyebrow">{eyebrow}</p>
      <h3 className="bn-book__title display">{title}</h3>
      <div className="bn-book__plate bn-plate" style={plate}>
        <Sticker key={species} scientificName={species} alt="" size="s" drop />
        <span className="bn-book__plate-text">
          {name !== species && <span className="label">{species}</span>}
          <span className="bn-book__plate-name display">{name}</span>
          {line && <span className="bn-book__plate-line">{line}</span>}
        </span>
      </div>
      {facts.length > 0 && (
        <dl className="bn-book__facts">
          {facts.map((fact) => (
            <div key={fact.label} className="bn-book__fact">
              <dt>{fact.label}</dt>
              <dd className="display">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </>
  );
}
