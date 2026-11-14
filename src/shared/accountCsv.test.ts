// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { downloadAccountCsv } from './accountCsv';

afterEach(() => { vi.unstubAllGlobals(); });

it('joins pages without duplicating the header and continues using both cursor fields', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const fetch = vi.fn().mockResolvedValueOnce(new Response('id,note\r\n1,"first\nline"\r\n', {
    headers: { 'X-Truncated': 'true', 'X-Next-After': '2026-11-14T12:00:00Z', 'X-Next-Id': id },
  })).mockResolvedValueOnce(new Response('id,note\r\n2,last\r\n'));
  vi.stubGlobal('fetch', fetch);
  const result = await downloadAccountCsv('test', new URLSearchParams({ site_id: id }));
  expect(await result.blob.text()).toBe('id,note\r\n1,"first\nline"\r\n2,last\r\n');
  expect(result.truncated).toBe(false);
  const params = new URL(String(fetch.mock.calls[1]?.[0]), 'https://app.invalid').searchParams;
  expect(params.get('after_id')).toBe(id);
  expect(params.get('after')).toBe('2026-11-14T12:00:00Z');
  expect(params.get('site_id')).toBe(id);
});

it('preserves the partial-file warning from an older API without continuation headers', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('id\n1\n', { headers: { 'X-Truncated': 'true' } })));
  expect((await downloadAccountCsv('test')).truncated).toBe(true);
});

it('refuses a repeated cursor rather than silently duplicating or endlessly downloading records', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('id\n1\n', {
    headers: { 'X-Truncated': 'true', 'X-Next-After': '2026-11-14T12:00:00Z', 'X-Next-Id': '00000000-0000-4000-8000-000000000001' },
  }))));
  await expect(downloadAccountCsv('test')).rejects.toThrow('did not advance');
});
