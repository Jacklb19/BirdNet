import { describe, expect, it } from 'vitest';
import { AuthApiError, type Session } from '@supabase/supabase-js';
import { AUTH_ERROR_CODES, GENERIC_ACCOUNT_FAILURE } from './account.constants';
import { accountFailure, toSyncSession } from './supabaseClient';

describe('toSyncSession', () => {
  it('passes only the identity, token and expiry the service worker needs', () => {
    const session = { access_token: 'jwt', refresh_token: 'secret', expires_at: 1_800_000_000, user: { id: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11', email: 'a@b.c' } } as unknown as Session;
    expect(toSyncSession(session)).toEqual({ userId: '7d9c2a52-1f0e-4f39-9a59-0d0f2f0d6c11', accessToken: 'jwt', expiresAt: 1_800_000_000 });
    expect(toSyncSession(null)).toBeNull();
  });
});

describe('accountFailure', () => {
  it('relies on the Supabase error code, not on the message text', () => {
    expect(accountFailure(new AuthApiError('Credenciales no válidas', 400, 'invalid_credentials'))).toBe(AUTH_ERROR_CODES.invalid_credentials);
    expect(accountFailure(new AuthApiError('Invalid login credentials', 400, undefined))).toBe(GENERIC_ACCOUNT_FAILURE);
    expect(accountFailure(new AuthApiError('Prototype key', 400, 'constructor'))).toBe(GENERIC_ACCOUNT_FAILURE);
    expect(accountFailure(new Error('Invalid login credentials'))).toBe(GENERIC_ACCOUNT_FAILURE);
  });
});
