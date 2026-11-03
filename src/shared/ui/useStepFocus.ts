import { useEffect, useRef } from 'react';

/**
 * Focus for a step that opens in place (a confirmation, a small form) and replaces the button that opened it: into the
 * step when it opens, back to the first button of `back` when it closes. Without it, the focused button disappears and
 * keyboard and screen reader users are left at the top of the page (WCAG 2.4.3).
 */
export function useStepFocus<Into extends HTMLElement, Back extends HTMLElement>(
  open: boolean,
): readonly [React.RefObject<Into | null>, React.RefObject<Back | null>] {
  const into = useRef<Into>(null);
  const back = useRef<Back>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) into.current?.focus();
    else if (wasOpen.current) (back.current?.matches('button, a[href]') ? back.current : back.current?.querySelector<HTMLElement>('button, a[href]'))?.focus();
    wasOpen.current = open;
  }, [open]);
  return [into, back] as const;
}
