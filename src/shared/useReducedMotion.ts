import { useSyncExternalStore } from 'react';
import { REDUCED_MOTION_QUERY } from '../config/layout';

/** Null where matchMedia is missing (jsdom, some embedded web views); those keep the default motion. */
function reducedMotionQuery(): MediaQueryList | null {
  const { matchMedia } = window as Partial<Pick<Window, 'matchMedia'>>;
  return typeof matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener('change', onChange);
  return () => { query?.removeEventListener('change', onChange); };
}

/** True when the person asked the system for less motion; follows the setting live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reducedMotionQuery()?.matches ?? false, () => false);
}
