import type { Page } from '@playwright/test';
import { API_PROXY_PREFIX, E2E_SUPABASE } from '../build.config.mjs';

/** Where Supabase Auth keeps the session of this project (as `sessionStorageKey` in the app, which reads Vite's env). */
export const SESSION_KEY = `sb-${new URL(E2E_SUPABASE.url).hostname.split('.')[0] ?? ''}-auth-token`;

export interface TestSession { readonly userId: string; readonly accessToken: string; readonly expiresAt: number }

/** A session the local API signs and accepts; `signedInAgo` dates the password back that many seconds. */
export async function testSession(page: Page, signedInAgo = 0): Promise<TestSession> {
  return await (await page.request.get(`${API_PROXY_PREFIX}/test/session?signed_in_ago=${String(signedInAgo)}`)).json() as TestSession;
}

/** The user Supabase Auth would return for a test session. */
export function testUser(session: TestSession, email = 'sprint4@example.invalid'): Record<string, unknown> {
  return {
    id: session.userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' },
    user_metadata: {}, identities: [{ id: session.userId, provider: 'email' }], factors: [], created_at: '2026-10-01T00:00:00Z',
  };
}

/**
 * Leaves a session where Supabase Auth keeps it, before the page loads, so the app starts signed in (ADR-45) without
 * Supabase: a token that has not expired is used as it is, with no request. `expiresAt` set in the past stores the
 * session of someone whose token ran out, as after an hour offline.
 */
export async function storeSession(page: Page, session: TestSession, expiresAt = session.expiresAt): Promise<void> {
  const stored = { access_token: session.accessToken, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: testUser(session) };
  await page.addInitScript(([key, value]) => { localStorage.setItem(key, value); }, [SESSION_KEY, JSON.stringify(stored)] as const);
}
