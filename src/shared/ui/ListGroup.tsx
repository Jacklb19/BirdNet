import { useId, type MouseEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './ListGroup.css';

export interface ListGroupProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Inset grouped list, the pattern people already know from their phone settings. */
export function ListGroup({ title, children, className }: ListGroupProps): React.JSX.Element {
  const id = useId();
  return (
    <section className={['bn-group', className ?? ''].filter(Boolean).join(' ')} aria-labelledby={title ? id : undefined}>
      {title && <h2 id={id} className="bn-group__title">{title}</h2>}
      <div className="bn-group__body">{children}</div>
    </section>
  );
}

export interface ListRowProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly value?: ReactNode;
  readonly icon?: IconName;
  readonly trailing?: ReactNode;
  readonly tone?: 'default' | 'danger' | 'brand';
  /** Opens another page: the row is a link, so it can open in a new tab and is announced as a link. */
  readonly href?: string;
  /**
   * Without `href` the row is a button that runs this. With `href` it runs before the link is followed on this
   * page (not when the link opens in another tab or window).
   */
  readonly onClick?: () => void;
  /**
   * The chevron says the row opens another page; a row that acts in place (signing out, say) passes false.
   * Defaults to true for links and buttons.
   */
  readonly chevron?: boolean;
  /**
   * Buttons only: the action is running. The row looks disabled and ignores clicks but keeps the keyboard focus,
   * which the `disabled` attribute would drop to the page.
   */
  readonly busy?: boolean;
  /** Lets a trailing control (e.g. a switch) be labelled by this row's text. */
  readonly labelId?: string;
  /** Lets a trailing control be described by this row's description. */
  readonly descriptionId?: string;
}

/** Ctrl, Cmd, Shift, Alt or a middle click open the link elsewhere, so this page is not the one that navigates. */
const followsHere = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function ListRow({
  label, description, value, icon, trailing, tone = 'default', href, onClick, chevron = true, busy = false, labelId, descriptionId,
}: ListRowProps): React.JSX.Element {
  const interactive = href !== undefined || onClick !== undefined;
  const content = (
    <>
      {icon && <span className="bn-row__icon"><Icon name={icon} /></span>}
      <span className="bn-row__text">
        <span id={labelId} className="bn-row__label">{label}</span>
        {description && <span id={descriptionId} className="bn-row__description">{description}</span>}
      </span>
      {value && <span className="bn-row__value">{value}</span>}
      {trailing}
      {interactive && chevron && <span className="bn-row__chevron"><Icon name="chevron" size="s" /></span>}
    </>
  );
  const className = `bn-row bn-row--${tone}`;
  if (href !== undefined) {
    return (
      <a className={`${className} bn-row--action`} href={href} onClick={(event) => { if (onClick && followsHere(event)) onClick(); }}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`${className} bn-row--action`} onClick={() => { if (!busy) onClick(); }}
        aria-disabled={busy || undefined} aria-busy={busy || undefined}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
