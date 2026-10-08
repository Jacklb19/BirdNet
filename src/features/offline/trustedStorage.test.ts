// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTrustedStorageUrl } from './trustedStorage';

/** Hoisted: the configuration mock below is created before the module's own constants. */
const { pageOrigin, projectOrigin } = vi.hoisted(() => ({ pageOrigin: 'https://birdnet.example', projectOrigin: 'https://project.supabase.co' }));
vi.mock(import('../../config/env'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, config: actual.readConfig({ VITE_SUPABASE_URL: projectOrigin, VITE_SUPABASE_ANON_KEY: 'test-anon-key' }) };
});
beforeEach(() => { vi.stubGlobal('self', { location: { origin: pageOrigin } }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('storage origin trust', () => {
  it('accepts only the page origin and the configured Supabase project', () => {
    expect(isTrustedStorageUrl(new URL('/models/model.onnx', pageOrigin))).toBe(true);
    expect(isTrustedStorageUrl(new URL('/storage/v1/object/upload/sign/audio/a.wav', projectOrigin))).toBe(true);
  });
  it.each(['https://other.supabase.co/upload', 'http://project.supabase.co/upload', 'https://project.supabase.co.evil.example/upload', 'https://foreign.example/upload'])('rejects %s', (url) => {
    expect(isTrustedStorageUrl(new URL(url))).toBe(false);
  });
});
