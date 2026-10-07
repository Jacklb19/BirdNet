import './Icon.css';

/** Line icons from the design file (24 × 24 grid; stroke width from --icon-stroke). Paths are drawing data, not configuration. */
const paths = {
  listen: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21',
  log: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6Z M9 3v18 M12.5 8h3.5 M12.5 12h3.5',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z M9 4v14 M15 6v14',
  sites: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0',
  settings: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 5v4 M9 15v4',
  synced: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18Z M9.5 13.8l2 2 3.5-4',
  pending: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18Z M12 11v3 M12 16.5v.01',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 20h14',
  export: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M5 14v6h14v-6',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  chevron: 'm9 6 6 6-6 6',
  back: 'm15 6-6 6 6 6',
  down: 'm6 9 6 6 6-6',
  check: 'M5 12.5 10 17 19 7',
  offline: 'M3 3l18 18 M8.5 16.5a5 5 0 0 1 7 0 M4.8 12.6A10 10 0 0 1 9 10.2 M14.8 10.2a10 10 0 0 1 4.4 2.4 M12 20h.01',
  privacy: 'M12 3 5 6v6c0 4.5 7 9 7 9s7-4.5 7-9V6Z M9 12l2 2 4-4',
  generated: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z',
  locate: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  close: 'M6 6l12 12 M18 6 6 18',
  plus: 'M12 5v14 M5 12h14',
  bird: 'M4 17c5 0 7-3 7-6V9a4 4 0 0 1 8 0l2 1.5-3 .8c-.8 5.6-5 8.7-14 5.7Z M15 8.5h.01',
} as const;

export type IconName = keyof typeof paths;

export interface IconProps {
  readonly name: IconName;
  readonly size?: 'm' | 's';
  /** When set the icon is announced; otherwise it is decorative and the adjacent text carries the meaning. */
  readonly label?: string;
}

export function Icon({ name, size = 'm', label }: IconProps): React.JSX.Element {
  return (
    <svg className={`bn-icon bn-icon--${size}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
