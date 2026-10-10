import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { BrandMark } from '../shared/ui/BrandMark';
import { Icon } from '../shared/ui/Icon';
import './SiteBar.css';

export interface SiteBarLink {
  readonly key: string;
  readonly label: string;
  /** A route of the app; links without one act in place through `onSelect` (the home page scrolls to a section). */
  readonly href?: string;
  readonly current?: boolean;
  readonly onSelect?: () => void;
}

export interface SiteBarProps {
  readonly links: readonly SiteBarLink[];
  /** Accessible name of the list of links. */
  readonly navLabel: string;
  /** Where the brand leads. */
  readonly brandHref: string;
  /** Trailing content: the way into the app on the home page, the live player and the account inside it. */
  readonly end?: ReactNode;
  /**
   * `site`: the home page, where the bar is the only navigation at every width (its links fold into a menu on
   * phones). `app`: inside the app, where phones use the tab bar and the bar shows on wide screens only.
   */
  readonly variant: 'site' | 'app';
}

/**
 * The one bar of Trino (ADR-24): the home page and the app share it, so entering the app only changes its links
 * instead of bringing a different navigation in. Flat on the sky of the hour; no floating pill.
 */
export function SiteBar({ links, navLabel, brandHref, end, variant }: SiteBarProps): React.JSX.Element {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const select = (link: SiteBarLink): void => {
    setOpen(false);
    link.onSelect?.();
  };
  return (
    <header className={`bn-sitebar bn-sitebar--${variant}`}>
      <div className="bn-sitebar__inner">
        <a className="bn-sitebar__brand" href={brandHref}><BrandMark name={dict.app.name} /></a>
        {variant === 'site' && (
          <button type="button" className="bn-sitebar__toggle" aria-expanded={open} aria-controls={menuId} onClick={() => { setOpen((value) => !value); }}>
            <Icon name={open ? 'close' : 'menu'} size="s" />
            <span>{dict.app.menu}</span>
          </button>
        )}
        <nav id={menuId} className={`bn-sitebar__nav${open ? ' bn-sitebar__nav--open' : ''}`} aria-label={navLabel}>
          <ul>
            {links.map((link) => (
              <li key={link.key}>
                {link.href
                  ? <a className="bn-sitebar__link" href={link.href} aria-current={link.current ? 'page' : undefined} onClick={() => { select(link); }}>{link.label}</a>
                  : <button type="button" className="bn-sitebar__link" aria-current={link.current ? 'true' : undefined} onClick={() => { select(link); }}>{link.label}</button>}
              </li>
            ))}
          </ul>
        </nav>
        {end && <div className="bn-sitebar__end">{end}</div>}
      </div>
    </header>
  );
}
