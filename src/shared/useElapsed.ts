import { useEffect, useState } from 'react';

/** Display refresh of running timers; one second is the finest unit any timer shows. */
const TICK_MS = 1000;

/** Milliseconds since `startedAt`, refreshed every second while it is set; 0 when it is null. */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => { setNow(Date.now()); }, TICK_MS);
    return () => { window.clearInterval(timer); };
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
