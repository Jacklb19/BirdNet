import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useIsDesktop } from '../config/layout';
import { useI18n } from '../i18n';
import { BrandMark } from '../shared/ui/BrandMark';
import { Icon, type IconName } from '../shared/ui/Icon';
import './SiteBar.css';

export interface SiteBarLink {
  readonly key: string;
  readonly label: string;
  /** A route of the app; links without one act in place through `onSelect` (the home page scrolls to a section). */
  readonly href?: string;
  readonly current?: boolean;
  readonly onSelect?: () => void;
  /** Shown beside the label in the phone menu. */
  readonly icon?: IconName;
}

/** A titled block of the phone menu. */
export interface SiteBarGroup {
  readonly key: string;
  readonly label: string;
  readonly links: readonly SiteBarLink[];
}

export interface SiteBarProps {
  /** Links written out in the bar on wide screens. */
  readonly links: readonly SiteBarLink[];
  /** Everything the phone menu offers, by group: it is the whole map of the site, not only this page's links. */
  readonly menu: readonly SiteBarGroup[];
  /** Accessible name of the list of links. */
  readonly navLabel: string;
  /** The brand always leads to the home page; on the home page itself it also acts in place (back to the top). */
  readonly brandHref: string;
  readonly onBrand?: () => void;
  /** Trailing content: the way into the app, the live player, the session. */
  readonly end?: ReactNode;
}

interface BarLinkProps {
  readonly link: SiteBarLink;
  readonly className: string;
  /** The menu shows each link's icon; the bar writes the words only. */
  readonly withIcon?: boolean;
  readonly onChosen: () => void;
}

function BarLink({ link, className, withIcon = false, onChosen }: BarLinkProps): React.JSX.Element {
  const content = (
    <>
      {withIcon && link.icon && <Icon name={link.icon} size="s" />}
      <span>{link.label}</span>
    </>
  );
  const choose = (): void => { onChosen(); link.onSelect?.(); };
  return link.href
    ? <a className={className} href={link.href} aria-current={link.current ? 'page' : undefined} onClick={choose}>{content}</a>
    : <button type="button" className={className} aria-current={link.current ? 'true' : undefined} onClick={choose}>{content}</button>;
}

/** Every element of the page beside `inside` and its ancestors that is not inert already: what an open menu covers. */
function pageOutside(inside: HTMLElement): HTMLElement[] {
  const outside: HTMLElement[] = [];
  for (let node: HTMLElement | null = inside; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) outside.push(sibling);
    }
  }
  return outside;
}

/**
 * The one bar of Trino (ADR-24, ADR-27): the home page and the app share it at every width, so the site reads as
 * one place. Wide screens write the links out; phones open a menu that drops over the page with the whole site
 * in it, grouped. Flat on the sky of the hour; no floating pill.
 */
export function SiteBar({ links, menu, navLabel, brandHref, onBrand, end }: SiteBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const isDesktop = useIsDesktop();
  const [requested, setRequested] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const menuId = useId();
  // Wide screens have no menu: one left open while the window grew is closed, not stranded.
  const open = requested && !isDesktop;
  // At the top of a page the bar is part of the sky; it only takes a veil once content scrolls under it.
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0);
  useEffect(() => {
    const onScroll = (): void => { setScrolled(window.scrollY > 0); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setRequested(false);
      toggle.current?.focus();
    };
    // The page behind the menu must not scroll under it, nor be reached with the keyboard or a screen reader: the menu
    // covers it (audit F02). Everything outside the bar becomes inert until the menu closes.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const covered = header.current ? pageOutside(header.current) : [];
    for (const element of covered) element.inert = true;
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      for (const element of covered) element.inert = false;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = (): void => { setRequested(false); };
  return (
    <header ref={header} className={`bn-sitebar${scrolled ? ' bn-sitebar--scrolled' : ''}${open ? ' bn-sitebar--open' : ''}`}>
      <div className="bn-sitebar__inner">
        <a className="bn-sitebar__brand" href={brandHref} onClick={() => { close(); onBrand?.(); }}><BrandMark name={dict.app.name} /></a>
        <nav className="bn-sitebar__nav" aria-label={navLabel}>
          <ul>
            {links.map((link) => <li key={link.key}><BarLink link={link} className="bn-sitebar__link" onChosen={close} /></li>)}
          </ul>
        </nav>
        {end && <div className="bn-sitebar__end">{end}</div>}
        <button ref={toggle} type="button" className="bn-sitebar__toggle" aria-expanded={open} aria-controls={menuId}
          aria-label={open ? dict.app.closeMenu : dict.app.menu} onClick={() => { setRequested((value) => !value); }}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </div>
      {open && (
        <nav id={menuId} className="bn-sitemenu" aria-label={dict.app.menu}>
          {menu.map((group) => (
            <section key={group.key} className="bn-sitemenu__group">
              <h2 className="label bn-sitemenu__heading">{group.label}</h2>
              <ul>
                {group.links.map((link) => <li key={link.key}><BarLink link={link} className="bn-sitemenu__link" withIcon onChosen={close} /></li>)}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </header>
  );
}
