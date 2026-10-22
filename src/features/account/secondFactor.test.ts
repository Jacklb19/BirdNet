import { describe, expect, it } from 'vitest';
import type { Factor, Session } from '@supabase/auth-js';
import { needsSecondStep, normalizeCode } from './secondFactor';

function token(claims: Record<string, unknown>): string {
  const encode = (value: object): string => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'ES256' })}.${encode(claims)}.signature`;
}

function session(aal: string | undefined, factors: readonly Pick<Factor, 'status'>[]): Session {
  return { access_token: token(aal ? { aal, sub: 'x', email: 'ñandú@example.org' } : { sub: 'x' }), user: { id: 'x', factors } } as unknown as Session;
}

describe('needsSecondStep', () => {
  it('asks for the code only when a verified factor exists and the session did not give it', () => {
    expect(needsSecondStep(null)).toBe(false);
    expect(needsSecondStep(session('aal1', []))).toBe(false);
    // A factor whose enrolment was never confirmed asks for nothing.
    expect(needsSecondStep(session('aal1', [{ status: 'unverified' }]))).toBe(false);
    expect(needsSecondStep(session('aal1', [{ status: 'verified' }]))).toBe(true);
    // Supabase treats a token without the claim as aal1.
    expect(needsSecondStep(session(undefined, [{ status: 'verified' }]))).toBe(true);
    expect(needsSecondStep(session('aal2', [{ status: 'verified' }]))).toBe(false);
  });

  it('treats an unreadable token as one that did not give the code', () => {
    const broken = { access_token: 'not-a-token', user: { id: 'x', factors: [{ status: 'verified' }] } } as unknown as Session;
    expect(needsSecondStep(broken)).toBe(true);
  });
});

describe('normalizeCode', () => {
  it('keeps the six digits however the app or the keyboard wrote them', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode(' 12-34-56 7')).toBe('123456');
    expect(normalizeCode('abc')).toBe('');
  });
});
