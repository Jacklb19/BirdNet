import { Icon, type IconName } from './Icon';
import './TabLinks.css';

export interface TabLink {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
  readonly icon?: IconName;
  /** A count shown after the label (the records in that part). */
  readonly count?: string;
}

export interface TabLinksProps {
  readonly label: string;
  readonly links: readonly TabLink[];
  /** `track`: the parts of a section, in one sunken bar. `chips`: a lighter filter inside one part. */
  readonly variant?: 'track' | 'chips';
}

/**
 * The parts of a section as links (ADR-47): each part has its own address, so Back returns to it, it can be shared
 * and opening a record and coming back lands on the same part with the same filter. Drawn like Segmented.
 */
export function TabLinks({ label, links, variant = 'track' }: TabLinksProps): React.JSX.Element {
  return (
    <nav className={`bn-tablinks bn-tablinks--${variant}`} aria-label={label}>
      <ul className="bn-tablinks__list">
        {links.map((link) => (
          <li key={link.key}>
            <a className="bn-tablinks__link" href={link.href} aria-current={link.current ? 'page' : undefined}>
              {link.icon && <Icon name={link.icon} size="s" />}
              <span>{link.label}</span>
              {link.count && <span className="bn-tablinks__count">{link.count}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
