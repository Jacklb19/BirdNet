import { useEffect } from 'react';
import { SKY_PHASE_STARTS, SKY_REFRESH_MS, type SkyPhase } from '../config/sky';

/** Phase of the sky at the device's local time: the last phase that has started; before the first, the night goes on. */
export function skyPhase(date: Date): SkyPhase {
  const hour = date.getHours();
  let phase: SkyPhase = SKY_PHASE_STARTS[SKY_PHASE_STARTS.length - 1]?.phase ?? 'night';
  for (const start of SKY_PHASE_STARTS) if (hour >= start.hour) phase = start.phase;
  return phase;
}

/** tokens.css paints the band behind the page from this attribute. */
export function applySky(date = new Date()): void {
  document.documentElement.dataset.sky = skyPhase(date);
}

/** Keeps the sky in step with the clock while a page stays open across a change of phase. */
export function useSkyClock(): void {
  useEffect(() => {
    applySky();
    const timer = window.setInterval(() => { applySky(); }, SKY_REFRESH_MS);
    return () => { window.clearInterval(timer); };
  }, []);
}
