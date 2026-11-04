import type { Session } from '@supabase/auth-js';
import { isUuid } from '../../config/contract';
import { needsSecondStep } from './secondFactor';

/** Who is signed in on this phone: enough to open the app and to tell their records from those of anyone else. */
export interface Identity {
  readonly userId: string;
  readonly email: string | null;
}

/** The identity of a live session, or null without one. */
export function identityOf(session: Session | null): Identity | null {
  if (!session || !isUuid(session.user.id)) return null;
  return { userId: session.user.id, email: session.user.email ?? null };
}

/**
 * The identity of the session Supabase Auth keeps on this phone, read without renewing it (ADR-45). Offline, a session
 * whose hour-long token expired cannot be renewed, and Auth then starts without one although it keeps it stored: the
 * person is still signed in, and the app opens for them with what the phone holds. A sign-out (or a session the
 * server revoked) removes the stored value, so this answers null after it. A session that still waits for the code
 * of the authenticator app opens nothing, as online.
 */
export function readStoredIdentity(storage: Pick<Storage, 'getItem'>, key: string): Identity | null {
  let stored: unknown;
  try { stored = JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; }
  if (!isStoredSession(stored)) return null;
  if (needsSecondStep(stored as unknown as Session)) return null;
  return { userId: stored.user.id, email: typeof stored.user.email === 'string' ? stored.user.email : null };
}

interface StoredSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly user: { readonly id: string; readonly email?: unknown; readonly factors?: unknown };
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const { access_token: access, refresh_token: refresh, user } = value as Record<string, unknown>;
  if (typeof access !== 'string' || !access || typeof refresh !== 'string' || !refresh) return false;
  if (typeof user !== 'object' || user === null) return false;
  const { id, factors } = user as Record<string, unknown>;
  return typeof id === 'string' && isUuid(id) && (factors === undefined || factors === null || Array.isArray(factors));
}
