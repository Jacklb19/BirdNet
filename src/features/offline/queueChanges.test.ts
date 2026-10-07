// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUEUE_CHANGE_POLL_MS, QUEUE_CHANGED_CHANNEL } from './offline.constants';

/** Each import is one context (page, inference worker, service worker): the signal is module state. */
async function context(): Promise<typeof import('./queueChanges')> {
  vi.resetModules();
  return import('./queueChanges');
}

/** Waits until `condition` holds; BroadcastChannel delivers on a later task. */
async function eventually(condition: () => boolean): Promise<void> {
  await vi.waitFor(() => { expect(condition()).toBe(true); });
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('queue change signal', () => {
  it('tells listeners in the same context at once, per part', async () => {
    const page = await context();
    const listener = vi.fn();
    cleanups.push(page.subscribeQueueChanges(listener));
    page.announceQueueChange(['settings']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect([page.queueVersion('settings'), page.queueVersion('records')]).toEqual([1, 0]);
  });

  it('reaches the pages from a worker that does not listen, also when only an acknowledgement changed', async () => {
    const page = await context();
    const worker = await context();
    const listener = vi.fn();
    cleanups.push(page.subscribeQueueChanges(listener));
    worker.announceQueueChange(['records']);
    await eventually(() => page.queueVersion('records') === 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(page.queueVersion('settings')).toBe(0);
  });

  it('ignores messages that are not queue changes', async () => {
    const page = await context();
    const listener = vi.fn();
    cleanups.push(page.subscribeQueueChanges(listener));
    const stranger = new BroadcastChannel(QUEUE_CHANGED_CHANNEL);
    cleanups.push(() => { stranger.close(); });
    stranger.postMessage('records');
    stranger.postMessage(['unknown']);
    stranger.postMessage(['records']);
    await eventually(() => page.queueVersion('records') === 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back to polling where BroadcastChannel is missing', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.useFakeTimers();
    const page = await context();
    const listener = vi.fn();
    expect(() => { page.announceQueueChange(['records']); }).not.toThrow();
    cleanups.push(page.subscribeQueueChanges(listener));
    vi.advanceTimersByTime(QUEUE_CHANGE_POLL_MS);
    expect(listener).toHaveBeenCalledTimes(1);
    expect([page.queueVersion('records'), page.queueVersion('settings')]).toEqual([2, 1]);
  });
});
