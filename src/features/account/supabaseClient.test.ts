import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { toSyncSession } from './supabaseClient';

describe('toSyncSession', () => {
  it('passes only the identity, token and expiry the service worker needs', () => {
    const session = { access_token: 'jwt', refresh_token: 'secret', expires_at: 1_800_000_000, user: { id: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11', email: 'a@b.c' } } as unknown as Session;
    expect(toSyncSession(session)).toEqual({ userId: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11', accessToken: 'jwt', expiresAt: 1_800_000_000 });
    expect(toSyncSession(null)).toBeNull();
  });
});
