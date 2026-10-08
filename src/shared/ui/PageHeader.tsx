import type { ReactNode } from 'react';
import { Icon } from './Icon';
import './PageHeader.css';

export interface PageHeaderProps {
  readonly title: string;
  /** One quiet line under the title (date, place, counts). */
  readonly subtitle?: ReactNode;
  /** When set, a back link is rendered before the title. */
  readonly back?: { readonly href: string; readonly label: string };
  /** Trailing actions aligned with the title. */
  readonly actions?: ReactNode;
}

/** Large page title. Every screen has exactly one h1, and it lives here. */
export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <header className="bn-page-header">
      {back && (
        <a className="bn-page-header__back" href={back.href}>
          <Icon name="back" size="s" />
          <span>{back.label}</span>
        </a>
      )}
      <div className="bn-page-header__row">
        <div className="bn-page-header__text">
          <h1 className="bn-page-header__title">{title}</h1>
          {subtitle && <p className="bn-page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="bn-page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
