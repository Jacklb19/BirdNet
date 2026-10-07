import { useSyncExternalStore } from 'react';

/** Mirrors the 64rem breakpoint in styles (CSS media queries cannot read custom properties). */
export const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY);
  query.addEventListener('change', onChange);
  return () => { query.removeEventListener('change', onChange); };
}

/** True on wide screens, where the floating top bar replaces the tab bar. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches, () => false);
}
