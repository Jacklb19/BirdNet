import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAccountResource } from './useAccountResource';

const EMPTY: readonly string[] = Object.freeze([]);

it('reports a failed account read and retries it without confusing it with an empty result', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce({ data: ['song'], limited: true });
  const { result } = renderHook(() => useAccountResource('token', 'owner', true, EMPTY, load));
  expect(result.current.status).toBe('loading');
  await waitFor(() => { expect(result.current.status).toBe('error'); });
  act(() => { result.current.retry(); });
  await waitFor(() => { expect(result.current.status).toBe('ready'); });
  expect(result.current.data).toEqual(['song']);
  expect(result.current.limited).toBe(true);
});

it('keeps cached data on token refresh but never reveals a previous account or a late response', async () => {
  let resolve: (value: { data: readonly string[]; limited: boolean }) => void = () => undefined;
  const load = vi.fn(() => new Promise<{ data: readonly string[]; limited: boolean }>((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ userId, token }) => useAccountResource(token, userId, true, EMPTY, load),
    { initialProps: { userId: 'first', token: 'old' } });
  const first = resolve;
  rerender({ userId: 'second', token: 'other' });
  await act(async () => { first({ data: ['private'], limited: false }); await Promise.resolve(); });
  expect(result.current.data).toEqual([]);
  await act(async () => { resolve({ data: ['own'], limited: false }); await Promise.resolve(); });
  rerender({ userId: 'second', token: 'refreshed' });
  expect(result.current.data).toEqual(['own']);
  expect(load).toHaveBeenCalledTimes(2);
});
