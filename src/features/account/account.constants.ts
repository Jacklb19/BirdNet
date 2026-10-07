/** Account rules shared by the Supabase client, the account hook and the sign-in form. */

import type { AuthChangeEvent } from '@supabase/supabase-js';

/**
 * Shortest password the form accepts. Keep it at or above "Minimum password length" in the Supabase Auth
 * settings, so the form never lets through a password the server rejects.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Browser session behavior: keep the session across reloads, refresh the access token before it expires (the
 * service worker needs a valid one for background sync), and complete e-mail confirmation links on arrival.
 */
export const SUPABASE_AUTH_OPTIONS = Object.freeze({
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
});

/**
 * Supabase Auth error codes (`AuthError.code`) the interface explains specifically, mapped to the account
 * error shown. Any other failure is reported as `generic`.
 */
export const AUTH_ERROR_CODES = Object.freeze({
  invalid_credentials: 'invalidCredentials',
} as const);

export type AuthErrorCode = keyof typeof AUTH_ERROR_CODES;

/**
 * Supabase Auth event of an explicit sign-out (or of a session the server revoked). Other events may also carry no
 * session, for example a stored session that could not be renewed offline, which is not a sign-out.
 */
export const SIGNED_OUT_EVENT = 'SIGNED_OUT' satisfies AuthChangeEvent;

/** Failure reported for any error without a specific explanation (network, unmapped codes, local storage). */
export const GENERIC_ACCOUNT_FAILURE = 'generic';

/** Failure kinds of the account actions; the interface has one message per kind. */
export type AccountFailure = (typeof AUTH_ERROR_CODES)[AuthErrorCode] | typeof GENERIC_ACCOUNT_FAILURE;

export function isMappedAuthErrorCode(code: string): code is AuthErrorCode {
  return Object.hasOwn(AUTH_ERROR_CODES, code);
}
