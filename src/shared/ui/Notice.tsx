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
}

/**
 * Inline message tied to the content around it. Errors are announced immediately (role="alert");
 * every other tone is a polite status so screen readers are not interrupted.
 */
export function Notice({ tone = 'info', icon, title, children, action }: NoticeProps): React.JSX.Element {
  return (
    <div className={`bn-notice bn-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {icon && <Icon name={icon} size="s" />}
      <div className="bn-notice__body">
        {title && <p className="bn-notice__title">{title}</p>}
        <div className="bn-notice__text">{children}</div>
        {action && <div className="bn-notice__action">{action}</div>}
      </div>
    </div>
  );
}
