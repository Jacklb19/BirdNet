import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { passwordsMatch } from './account.constants';
import { accountInitials } from './accountInitials';
import { normalizeAlias, parseOwnSpecies, parseProfile, parseSummary } from './profileApi';

const { projectUrl } = vi.hoisted(() => ({ projectUrl: 'https://project.supabase.co' }));
vi.mock(import('../../config/env'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, config: actual.readConfig({ VITE_SUPABASE_URL: projectUrl, VITE_SUPABASE_ANON_KEY: 'test-anon-key' }) };
});

describe('account forms', () => {
  it('requires the two passwords to agree and not be empty', () => {
    expect(passwordsMatch('secreto123', 'secreto123')).toBe(true);
    expect(passwordsMatch('secreto123', 'secreto124')).toBe(false);
    expect(passwordsMatch('', '')).toBe(false);
  });
  it('trims the alias, clears it when blank and rejects one over the limit', () => {
    expect(normalizeAlias('  Jose Luis ')).toBe('Jose Luis');
    expect(normalizeAlias('   ')).toBeNull();
    expect(() => normalizeAlias('x'.repeat(41))).toThrow();
    expect(accountInitials('Jose Luis')).toBe('JL');
  });
});

describe('profile responses', () => {
  beforeEach(() => { vi.stubGlobal('self', { location: { origin: 'https://birdnet.example' } }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows only photos signed by the configured project', () => {
    expect(parseProfile({ alias: 'Ana', avatar_url: `${projectUrl}/storage/v1/object/sign/avatars/a.webp?token=t` }).avatarUrl).toContain(projectUrl);
    expect(parseProfile({ alias: null, avatar_url: 'https://tracker.example/a.webp' })).toEqual({ alias: null, avatarUrl: null });
    expect(() => parseProfile({ alias: 3, avatar_url: null })).toThrow();
  });
  it('validates totals and drops malformed species rows', () => {
    expect(parseSummary({ detections: 3, species: 2, sites: 1, active_days: 1, first_recorded_at: null, last_recorded_at: null }).species).toBe(2);
    expect(() => parseSummary({ detections: -1, species: 2, sites: 1, active_days: 1, first_recorded_at: null, last_recorded_at: null })).toThrow();
    const good = { species: 'Turdus fuscater', detections: 3, best_confidence: 0.9, first_recorded_at: '2026-10-01T06:00:00Z', last_recorded_at: '2026-10-07T06:00:00Z', sites: 1 };
    expect(parseOwnSpecies({ species: [good, { ...good, best_confidence: 3 }] })).toHaveLength(1);
  });
});
