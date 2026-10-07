import { useId, type ReactNode } from 'react';
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
  readonly onClick?: () => void;
  /** Lets a trailing control (e.g. a switch) be labelled by this row's text. */
  readonly labelId?: string;
}

export function ListRow({ label, description, value, icon, trailing, tone = 'default', onClick, labelId }: ListRowProps): React.JSX.Element {
  const content = (
    <>
      {icon && <span className="bn-row__icon"><Icon name={icon} /></span>}
      <span className="bn-row__text">
        <span id={labelId} className="bn-row__label">{label}</span>
        {description && <span className="bn-row__description">{description}</span>}
      </span>
      {value && <span className="bn-row__value">{value}</span>}
      {trailing}
      {onClick && <span className="bn-row__chevron"><Icon name="chevron" size="s" /></span>}
    </>
  );
  const className = `bn-row bn-row--${tone}`;
  return onClick
    ? <button type="button" className={`${className} bn-row--action`} onClick={onClick}>{content}</button>
    : <div className={className}>{content}</div>;
}
