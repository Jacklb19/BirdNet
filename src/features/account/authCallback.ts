/**
 * What Supabase says when a return to the app did not end in a session. After Google or an e-mail link it sends
 * the browser back with the outcome in the address: tokens when it worked, and `error`, `error_code` and
 * `error_description` (in the query and in the hash) when it did not. The Supabase client only consumes the
 * tokens, so without this the failure would be silent: the person would land in the app, signed out, with no
 * word on why.
 */
import type { ReturnFailure } from './account.constants';

/** Longest server description shown; it is foreign text, so it is bounded as well as escaped. */
const MAX_DETAIL_LENGTH = 200;

/** Supabase Auth code of an e-mail link that was already used or is too old. */
const EXPIRED_LINK_CODE = 'otp_expired';

export interface AuthCallbackError {
  readonly failure: ReturnFailure;
  /** What the server said, for whoever has to fix the configuration; null when it said nothing. */
  readonly detail: string | null;
}

/** The failure a return address carries, or null when it carries none (a normal visit, or a successful return). */
export function readAuthCallbackError(href: string): AuthCallbackError | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const read = (name: string): string | null => hash.get(name) ?? url.searchParams.get(name);
  const code = read('error_code');
  const description = read('error_description');
  if (!read('error') && !code && !description) return null;
  const detail = (description ?? code ?? '').trim().slice(0, MAX_DETAIL_LENGTH);
  return { failure: code === EXPIRED_LINK_CODE ? 'linkExpired' : 'returnFailed', detail: detail || null };
}
