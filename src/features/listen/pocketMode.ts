import { useSyncExternalStore } from 'react';

/**
 * Pocket mode: a web page only listens while the screen is on, so someone who puts the phone away loses the
 * session when it locks. In pocket mode the screen stays on and black, and ignores every touch except a long press
 * on its one button (`PocketScreen.tsx`).
 *
 * The state lives outside React because the button that turns it on is deep inside a screen and the black screen
 * covers the whole app.
 */
let on = false;
/** What had the focus when the mode was asked for; the app goes inert under the black screen and loses it. */
let opener: Element | null = null;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (on === next) return;
  on = next;
  for (const listener of [...listeners]) listener();
}

export function enterPocketMode(): void {
  if (!on) opener = document.activeElement;
  set(true);
}

/** Gives the focus back to the control that turned the mode on; called once the app answers again. */
export function returnPocketFocus(): void {
  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
}

export function leavePocketMode(): void {
  set(false);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether the person asked for pocket mode; it only shows while a session is listening (`AppShell.tsx`). */
export function usePocketMode(): boolean {
  return useSyncExternalStore(subscribe, () => on, () => false);
}
