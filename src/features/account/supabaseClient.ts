import { createClient, isAuthError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';
import type { SyncSession } from '../offline/types';
import { AUTH_ERROR_CODES, GENERIC_ACCOUNT_FAILURE, isMappedAuthErrorCode, SUPABASE_AUTH_OPTIONS, type AccountFailure } from './account.constants';

/** Null when the build has no Supabase configuration; the app then keeps working fully on the device. */
export const supabase: SupabaseClient | null = config.supabase
  ? createClient(config.supabase.url, config.supabase.anonKey, { auth: SUPABASE_AUTH_OPTIONS })
  : null;

/** Only the fields the service worker needs to authenticate synchronization requests. */
export function toSyncSession(session: Session | null): SyncSession | null {
  if (!session?.expires_at) return null;
  return { userId: session.user.id, accessToken: session.access_token, expiresAt: session.expires_at };
}

/** Classifies a failed account action by Supabase's stable error code, never by its (English, changeable) message. */
export function accountFailure(caught: unknown): AccountFailure {
  return isAuthError(caught) && caught.code && isMappedAuthErrorCode(caught.code) ? AUTH_ERROR_CODES[caught.code] : GENERIC_ACCOUNT_FAILURE;
}
