import type { GoTrueClient, Session } from '@supabase/auth-js';
import { config } from '../../config/env';
import type { SyncSession } from '../offline/types';
import { AUTH_ERROR_CODES, GENERIC_ACCOUNT_FAILURE, isMappedAuthErrorCode, SUPABASE_AUTH_OPTIONS, type AccountFailure } from './account.constants';

/** Whether this build has accounts; without Supabase configuration the app keeps working fully on the device. */
export const accountsConfigured = config.supabase !== null;

/**
 * Key under which the session is kept in localStorage: the one supabase-js used, so sessions saved before the app
 * switched to the auth client alone (S11) are still found.
 */
export function sessionStorageKey(projectUrl: string): string {
  const [project = ''] = new URL(projectUrl).hostname.split('.');
  return `sb-${project}-auth-token`;
}

let client: Promise<GoTrueClient | null> | null = null;

/**
 * Supabase Auth, loaded apart from the app's first screen: only accounts use it. The app asks for it as soon as it
 * starts, so a session coming back in the address (Google, e-mail links) is read before anything changes the hash.
 */
export function authClient(): Promise<GoTrueClient | null> {
  const supabase = config.supabase;
  client ??= supabase
    ? import('@supabase/auth-js').then(({ GoTrueClient: Client }) => new Client({
      url: new URL('auth/v1', supabase.url.endsWith('/') ? supabase.url : `${supabase.url}/`).href,
      headers: { Authorization: `Bearer ${supabase.anonKey}`, apikey: supabase.anonKey },
      storageKey: sessionStorageKey(supabase.url),
      ...SUPABASE_AUTH_OPTIONS,
    }))
    : Promise.resolve(null);
  return client;
}

/** Only the fields the service worker needs to authenticate synchronization requests. */
export function toSyncSession(session: Session | null): SyncSession | null {
  if (!session?.expires_at) return null;
  return { userId: session.user.id, accessToken: session.access_token, expiresAt: session.expires_at };
}

/**
 * Whether a value is an error of Supabase Auth. The same test as `isAuthError` of the library, written here so that
 * classifying an error does not load the library with the first screen.
 */
function isAuthFailure(caught: unknown): caught is { readonly code?: string } {
  return typeof caught === 'object' && caught !== null && '__isAuthError' in caught;
}

/** Classifies a failed account action by Supabase's stable error code, never by its (English, changeable) message. */
export function accountFailure(caught: unknown): AccountFailure {
  return isAuthFailure(caught) && caught.code && isMappedAuthErrorCode(caught.code) ? AUTH_ERROR_CODES[caught.code] : GENERIC_ACCOUNT_FAILURE;
}
