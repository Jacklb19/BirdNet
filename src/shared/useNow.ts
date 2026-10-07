import { useEffect, useState } from 'react';

/**
 * Wall-clock time in epoch milliseconds, refreshed every `intervalMs` while `enabled`, so relative times on
 * screen ("5 min ago") stay true while it is open. A disabled clock keeps its last value and costs no timer.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => { setNow(Date.now()); }, intervalMs);
    return () => { window.clearInterval(timer); };
  }, [intervalMs, enabled]);
  return now;
}
