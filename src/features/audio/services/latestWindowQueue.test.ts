import { describe, expect, it, vi } from 'vitest';
import { LatestWindowQueue } from './latestWindowQueue';

describe('LatestWindowQueue', () => {
  it('keeps only the latest pending window over 1000 arrivals', () => {
    const dispatch = vi.fn();
    const onDrop = vi.fn();
    const queue = new LatestWindowQueue<number>(dispatch, onDrop);
    for (let index = 0; index < 1000; index++) queue.enqueue(index);
    expect(dispatch.mock.calls).toEqual([[0]]);
    expect(onDrop).toHaveBeenCalledTimes(998);
    queue.complete();
    expect(dispatch.mock.calls).toEqual([[0], [999]]);
    queue.complete();
    queue.enqueue(1000);
    expect(dispatch).toHaveBeenLastCalledWith(1000);
  });

  it('forgets pending work on stop and accepts a new session', () => {
    const dispatch = vi.fn();
    const queue = new LatestWindowQueue<number>(dispatch);
    queue.enqueue(0);
    queue.enqueue(1);
    queue.enqueue(2);
    queue.clear();
    queue.complete();
    queue.enqueue(3);
    expect(dispatch.mock.calls).toEqual([[0], [3]]);
  });
});
