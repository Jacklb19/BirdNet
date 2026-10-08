import type { ReactNode } from 'react';
import './Page.css';

export interface PageProps {
  readonly children: ReactNode;
  /** `narrow` for forms and settings; `wide` for dashboards that use two columns on large screens. */
  readonly width?: 'narrow' | 'wide';
  /** Full-bleed screens (map, detail hero) manage their own edges. */
  readonly bleed?: boolean;
  readonly className?: string;
}

/** Content column shared by every screen: side gutters, maximum width and vertical rhythm. */
export function Page({ children, width = 'wide', bleed = false, className }: PageProps): React.JSX.Element {
  const classes = ['bn-page', `bn-page--${width}`, bleed ? 'bn-page--bleed' : '', className ?? ''].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}
