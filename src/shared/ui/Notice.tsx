import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './Notice.css';

export type NoticeTone = 'info' | 'caution' | 'error' | 'success';

export interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly icon?: IconName;
  readonly title?: string;
  readonly children: ReactNode;
  /** Optional action rendered after the text (normally a quiet Button). */
  readonly action?: ReactNode;
  /**
   * Announced politely when it appears or changes: the result of something the person did, or a change of
   * connection. Permanent notes (caveats, explanations) stay silent, so they are not read out on every update.
   */
  readonly live?: boolean;
}

/** Inline message tied to the content around it. Errors are always announced immediately (role="alert"). */
export function Notice({ tone = 'info', icon, title, children, action, live = false }: NoticeProps): React.JSX.Element {
  const role = tone === 'error' ? 'alert' : live ? 'status' : undefined;
  return (
    <div className={`bn-notice bn-notice--${tone}`} role={role}>
      {icon && <Icon name={icon} size="s" />}
      <div className="bn-notice__body">
        {title && <p className="bn-notice__title">{title}</p>}
        <div className="bn-notice__text">{children}</div>
        {action && <div className="bn-notice__action">{action}</div>}
      </div>
    </div>
  );
}
