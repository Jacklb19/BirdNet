import { HOURS_PER_DAY } from '../../config/contract';

export interface ChorusBar { hour: number; count: number; length: number; peak: boolean }

/** One radial bar per local hour, proportional to its detections; the busiest hour is marked as the peak. */
export function chorusBars(hourly: readonly number[]): ChorusBar[] {
  if (hourly.length !== HOURS_PER_DAY || hourly.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`Expected ${String(HOURS_PER_DAY)} hourly counts.`);
  }
  const max = Math.max(...hourly);
  return hourly.map((count, hour) => ({ hour, count, length: max ? count / max : 0, peak: max > 0 && count === max }));
}

export function peakHour(hourly: readonly number[]): number | null {
  const max = Math.max(...hourly);
  return max > 0 ? hourly.indexOf(max) : null;
}
