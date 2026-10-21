/**
 * Whether this phone keeps up with two models listening together (ADR-36, RNF-01, RNF-02). Measured on a desktop the
 * pair takes about 0.4 s per window; a mid-range phone may be three to five times slower, close to the 1.5 s between
 * windows. When it falls behind, the default goes back to the first model alone instead of losing windows.
 */
import { PACE_LIMITS } from './inference.constants';

export interface PaceLimits {
  /** Windows analysed before any verdict: the first ones include warming up. */
  readonly minWindows: number;
  /** Latest windows whose median latency is compared with `maxMedianMs`. */
  readonly recentWindows: number;
  readonly maxMedianMs: number;
  /** Share of windows dropped by back-pressure, counted once `minWindows` were seen in all. */
  readonly maxDroppedShare: number;
}

export interface PaceWatch {
  analysed(latencyMs: number): void;
  dropped(count: number): void;
  /** True once the phone proved too slow; it does not change back within a session. */
  tooSlow(): boolean;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}

export function watchPace(limits: PaceLimits = PACE_LIMITS): PaceWatch {
  const recent: number[] = [];
  let analysed = 0;
  let dropped = 0;
  let slow = false;
  const judge = (): void => {
    if (slow) return;
    const seen = analysed + dropped;
    const lagging = recent.length >= limits.recentWindows && median(recent) > limits.maxMedianMs;
    const losing = seen >= limits.minWindows && dropped / seen > limits.maxDroppedShare;
    slow = analysed >= limits.minWindows ? lagging || losing : losing;
  };
  return {
    analysed(latencyMs) {
      if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
      analysed += 1;
      recent.push(latencyMs);
      if (recent.length > limits.recentWindows) recent.shift();
      judge();
    },
    dropped(count) {
      if (!Number.isSafeInteger(count) || count <= 0) return;
      dropped += count;
      judge();
    },
    tooSlow: () => slow,
  };
}
