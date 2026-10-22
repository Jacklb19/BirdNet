/**
 * What one listening session measured on this phone, as evidence of RNF-01 (time per window), RNF-02 (no window lost),
 * RNF-03 (no main-thread task over 50 ms) and RNF-04 (battery per hour). Everything stays on the phone; the person
 * copies the summary by hand if they want to share it.
 */
import { PERFORMANCE_LIMITS } from './performance.config';

export interface BatteryReading {
  /** Charge from 0 to 1, as the Battery Status API gives it. */
  readonly level: number;
  readonly charging: boolean;
}

/** Why a session has no battery figure: the browser has no Battery Status API, it charged, or it was too short. */
export type BatteryGap = 'unsupported' | 'charging' | 'short';

export interface SessionSummary {
  /** ISO timestamp of the start. */
  readonly startedAt: string;
  readonly durationSeconds: number;
  /** Version of the model (or models) that listened; null when none loaded. */
  readonly model: string | null;
  readonly analysed: number;
  readonly dropped: number;
  readonly medianMs: number | null;
  readonly p90Ms: number | null;
  readonly maxMs: number | null;
  /** Main-thread tasks over 50 ms, where the browser reports them (Long Tasks API); null where it does not. */
  readonly longTasks: number | null;
  readonly longestTaskMs: number | null;
  readonly batteryPerHour: number | null;
  readonly batteryGap: BatteryGap | null;
}

export interface SessionRecorder {
  model(version: string): void;
  analysed(latencyMs: number): void;
  dropped(count: number): void;
  longTask(durationMs: number): void;
  battery(reading: BatteryReading): void;
  /** The summary at `endedAt` (epoch milliseconds). */
  finish(endedAt: number): SessionSummary;
}

/** The value below which `fraction` of the sorted values lie (nearest rank). */
export function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(fraction * sorted.length)));
  return sorted[rank - 1] ?? null;
}

/**
 * Starts measuring a session at `startedAt` (epoch milliseconds). `longTasksObserved` says whether the browser reports
 * long tasks at all, so that "none" is not confused with "not measured".
 */
export function recordSession(startedAt: number, longTasksObserved: boolean): SessionRecorder {
  const latencies: number[] = [];
  let version: string | null = null;
  let dropped = 0;
  let longTasks = 0;
  let longestTask = 0;
  let first: BatteryReading | null = null;
  let last: BatteryReading | null = null;
  let charged = false;

  return {
    model(next) { version = next; },
    analysed(latencyMs) {
      // Bounded: a very long session keeps its first windows, which are enough for the median and the p90.
      if (Number.isFinite(latencyMs) && latencyMs >= 0 && latencies.length < PERFORMANCE_LIMITS.maxWindowsKept) latencies.push(latencyMs);
    },
    dropped(count) { if (Number.isSafeInteger(count) && count > 0) dropped += count; },
    longTask(durationMs) {
      if (!Number.isFinite(durationMs) || durationMs <= 0) return;
      longTasks += 1;
      longestTask = Math.max(longestTask, durationMs);
    },
    battery(reading) {
      if (!Number.isFinite(reading.level) || reading.level < 0 || reading.level > 1) return;
      first ??= reading;
      last = reading;
      charged ||= reading.charging;
    },
    finish(endedAt) {
      const durationSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
      const sorted = [...latencies].sort((a, b) => a - b);
      let batteryPerHour: number | null = null;
      let batteryGap: BatteryGap | null = null;
      if (!first || !last) batteryGap = 'unsupported';
      else if (charged) batteryGap = 'charging';
      else if (durationSeconds < PERFORMANCE_LIMITS.minBatterySeconds) batteryGap = 'short';
      else batteryPerHour = Math.max(0, ((first.level - last.level) * 100 * 3600) / durationSeconds);
      return {
        startedAt: new Date(startedAt).toISOString(), durationSeconds, model: version, analysed: latencies.length, dropped,
        medianMs: percentile(sorted, 0.5), p90Ms: percentile(sorted, 0.9), maxMs: sorted.at(-1) ?? null,
        longTasks: longTasksObserved ? longTasks : null, longestTaskMs: longTasksObserved && longTasks > 0 ? longestTask : null,
        batteryPerHour, batteryGap,
      };
    },
  };
}

/** Share of the windows that back-pressure dropped, from 0 to 1; null before any window. */
export function droppedShare(summary: Pick<SessionSummary, 'analysed' | 'dropped'>): number | null {
  const seen = summary.analysed + summary.dropped;
  return seen > 0 ? summary.dropped / seen : null;
}
