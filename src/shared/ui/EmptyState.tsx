import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './EmptyState.css';

export interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly children?: ReactNode;
  /** The next step the person can take; an empty screen always invites an action. */
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps): React.JSX.Element {
  return (
    <section className="bn-empty">
      <span className="bn-empty__icon"><Icon name={icon} /></span>
      <h2 className="bn-empty__title">{title}</h2>
      {children && <div className="bn-empty__text">{children}</div>}
      {action && <div className="bn-empty__action">{action}</div>}
    </section>
  );
}
