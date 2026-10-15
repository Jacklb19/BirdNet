import { useEffect, useState } from 'react';

/** Whether this browser can keep the screen on (Screen Wake Lock); without it the person has to do it themselves. */
export const screenAwakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * `asking`: the browser has not answered yet. `held`: the screen stays on. `refused`: the browser would not keep it
 * on, which is what a battery saver does.
 */
export type ScreenAwake = 'off' | 'asking' | 'held' | 'refused';

/**
 * Keeps the screen on while `enabled`: a web page stops listening once the phone locks. The browser releases the
 * lock whenever the page is hidden, so it is taken again on return.
 */
export function useScreenAwake(enabled: boolean): ScreenAwake {
  const [answer, setAnswer] = useState<Exclude<ScreenAwake, 'off'>>('asking');

  useEffect(() => {
    if (!enabled || !screenAwakeSupported) return;
    let sentinel: WakeLockSentinel | null = null;
    let ended = false;
    const acquire = (): void => {
      navigator.wakeLock.request('screen')
        .then((lock) => {
          if (ended) {
            void lock.release();
            return;
          }
          sentinel = lock;
          setAnswer('held');
        })
        // Refused while the page is hidden or the battery saver is on; the next return to the page tries again.
        .catch(() => { if (!ended && document.visibilityState === 'visible') setAnswer('refused'); });
    };
    const onVisibility = (): void => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ended = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      setAnswer('asking');
    };
  }, [enabled]);

  return enabled && screenAwakeSupported ? answer : 'off';
}
