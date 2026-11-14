// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fetchWalkPage, fetchWalkPaths } from './walksApi';

afterEach(() => { vi.unstubAllGlobals(); });

it('continues lists and map paths after both the start time and identifier', async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response('{"walks":[],"has_more":false}')));
  vi.stubGlobal('fetch', fetch);
  const id = '00000000-0000-4000-8000-000000000001';
  const started = Date.parse('2026-11-14T12:00:00Z');
  await fetchWalkPage('test', started, 2, undefined, id);
  await fetchWalkPaths('test', started, undefined, id);
  for (const [url] of fetch.mock.calls as unknown as [string][]) {
    const params = new URL(url, 'https://app.invalid').searchParams;
    expect(params.get('before')).toBe(new Date(started).toISOString());
    expect(params.get('after_id')).toBe(id);
  }
});
