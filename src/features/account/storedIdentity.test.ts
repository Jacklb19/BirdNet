import { describe, expect, it } from 'vitest';
import { readStoredIdentity } from './storedIdentity';

const KEY = 'sb-project-auth-token';
const USER_ID = '7b0a3c1e-5d2f-4a8b-9c6d-0e1f2a3b4c5d';

function token(claims: Record<string, unknown>): string {
  const encode = (value: object): string => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'ES256' })}.${encode(claims)}.signature`;
}

function storageWith(value: unknown): Pick<Storage, 'getItem'> {
  return { getItem: (key) => (key === KEY && value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : null) };
}

const stored = (overrides: Record<string, unknown> = {}, user: Record<string, unknown> = {}): Record<string, unknown> => ({
  // Expired an hour ago: offline it cannot be renewed, and it still says who signed in.
  access_token: token({ sub: USER_ID, aal: 'aal1', exp: 1 }), refresh_token: 'refresh', expires_at: 1,
  user: { id: USER_ID, email: 'tángara@example.org', factors: [], ...user }, ...overrides,
});

describe('readStoredIdentity', () => {
  it('reads who is signed in from the stored session, even with its token expired', () => {
    expect(readStoredIdentity(storageWith(stored()), KEY)).toEqual({ userId: USER_ID, email: 'tángara@example.org' });
  });

  it('answers null when nothing is stored, as after a sign-out', () => {
    expect(readStoredIdentity(storageWith(undefined), KEY)).toBeNull();
  });

  it('answers null for anything that is not a session', () => {
    expect(readStoredIdentity(storageWith('{not json'), KEY)).toBeNull();
    expect(readStoredIdentity(storageWith({ user: { id: USER_ID } }), KEY)).toBeNull();
    expect(readStoredIdentity(storageWith(stored({ refresh_token: '' })), KEY)).toBeNull();
    expect(readStoredIdentity(storageWith(stored({}, { id: 'not-a-uuid' })), KEY)).toBeNull();
  });

  it('opens nothing for a session that still waits for the code of the authenticator app', () => {
    expect(readStoredIdentity(storageWith(stored({}, { factors: [{ status: 'verified' }] })), KEY)).toBeNull();
    const given = stored({ access_token: token({ sub: USER_ID, aal: 'aal2' }) }, { factors: [{ status: 'verified' }] });
    expect(readStoredIdentity(storageWith(given), KEY)).toEqual({ userId: USER_ID, email: 'tángara@example.org' });
  });

  it('keeps an account without an e-mail', () => {
    expect(readStoredIdentity(storageWith(stored({}, { email: undefined })), KEY)?.email).toBeNull();
  });
});
