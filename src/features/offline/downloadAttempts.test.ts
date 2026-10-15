import { describe, expect, it, vi } from 'vitest';
import { untilComplete } from './downloadAttempts';
import type { OfflineProgressCallback } from './offlineClient';

const TOTAL = 100;

/** A download that stops after reporting each list of amounts, except the last attempt, which finishes. */
function attempts(...reports: readonly (readonly number[])[]): (progress: OfflineProgressCallback) => Promise<string> {
  let attempt = 0;
  return (progress) => {
    const amounts = reports[attempt] ?? [];
    attempt += 1;
    for (const received of amounts) progress(received, TOTAL);
    return attempt === reports.length ? Promise.resolve('installed') : Promise.reject(new Error('stopped'));
  };
}

describe('download carried through its interruptions', () => {
  it('asks again while every attempt gets further, and never shows less than before', async () => {
    const shown = vi.fn();
    // The second attempt counts the kept pieces again from the start.
    expect(await untilComplete(attempts([10, 45], [40, 80], [80, TOTAL]), shown)).toBe('installed');
    expect(shown.mock.calls.map(([received]) => received as number)).toEqual([10, 45, 45, 80, 80, TOTAL]);
  });

  it('reports the failure when an attempt gets no further than the one before', async () => {
    const attempt = vi.fn(attempts([10, 45], [40], [TOTAL]));
    await expect(untilComplete(attempt, () => undefined)).rejects.toThrow('stopped');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a download that never started', async () => {
    const attempt = vi.fn(attempts([], [TOTAL]));
    await expect(untilComplete(attempt, () => undefined)).rejects.toThrow('stopped');
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
