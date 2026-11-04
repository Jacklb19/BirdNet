import { describe, expect, it } from 'vitest';
import { signedInAt } from './sessionClaims';

/** An unsigned token with these claims: only the payload is read. */
const tokenWith = (claims: unknown): string => `header.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.signature`;

describe('signedInAt', () => {
  it('takes the latest authentication of the session', () => {
    expect(signedInAt(tokenWith({ amr: [{ method: 'password', timestamp: 1_000 }, { method: 'totp', timestamp: 1_600 }] }))).toBe(1_600_000);
  });

  it('knows no sign-in from a token that names none or names it badly', () => {
    expect(signedInAt(tokenWith({}))).toBeNull();
    expect(signedInAt(tokenWith({ amr: 'password' }))).toBeNull();
    expect(signedInAt(tokenWith({ amr: [{ method: 'password', timestamp: 'now' }, null] }))).toBeNull();
    expect(signedInAt('not a token')).toBeNull();
  });
});
