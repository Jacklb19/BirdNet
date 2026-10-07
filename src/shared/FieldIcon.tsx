export type FieldIconName = 'mic' | 'stop' | 'signal' | 'settings' | 'shield' | 'download' | 'ready' | 'error' | 'clock' | 'sun' | 'moon' | 'system' | 'bird' | 'map' | 'user';

const paths: Record<FieldIconName, string> = {
  mic: 'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',
  stop: 'M6 6h12v12H6Z',
  signal: 'M3 12h3l2-7 4 14 4-14 2 7h3',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z M8 12l3 3 5-6',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  ready: 'M4 12l5 5L20 6',
  error: 'M12 3 2 21h20Z M12 9v5 M12 17v1',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',
  moon: 'M20 14a9 9 0 0 1-10-10A9 9 0 1 0 20 14Z',
  system: 'M3 4h18v13H3Z M8 21h8 M12 17v4',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z M9 4v14 M15 6v14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0',
  bird: 'M3 18c6 0 8-3 8-7V8a4 4 0 0 1 8 0l3 2-4 1c-1 7-6 10-15 7Z M11 11 4 7l3 8 M15 7h.01',
};

/** Decorative line icons; the adjacent translated label supplies the meaning. */
export function FieldIcon({ name }: { readonly name: FieldIconName }): React.JSX.Element {
  return <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
