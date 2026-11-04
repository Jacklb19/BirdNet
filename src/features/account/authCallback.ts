/**
 * What Supabase says when a return to the app did not end in a session. After Google or an e-mail link it sends
 * the browser back with the outcome in the address: tokens when it worked, and `error`, `error_code` and
 * `error_description` (in the query and in the hash) when it did not. The Supabase client only consumes the
 * tokens, so without this the failure would be silent: the person would land in the app, signed out, with no
 * word on why.
 */
import type { ReturnFailure } from './account.constants';

/**
 * What may be shown of the server's answer: its error code, a short machine word. The description is free text that
 * anyone can put in a link to Trino, so it never reaches the screen (audit of 2026-11-02).
 */
const ERROR_CODE = /^[a-z][a-z0-9_]{0,59}$/;

/** Supabase Auth code of an e-mail link that was already used or is too old. */
const EXPIRED_LINK_CODE = 'otp_expired';

export interface AuthCallbackError {
  readonly failure: ReturnFailure;
  /** The server's error code, for whoever has to fix the configuration; null when it gave none that looks like one. */
  readonly detail: string | null;
}

/** Where Supabase Auth keeps the PKCE verifiers of a browser, by the session's storage key (auth-js `helpers`). */
const verifierKeys = (storageKey: string, flowId: string | null): readonly string[] =>
  [`${storageKey}-code-verifier`, ...(flowId ? [`${storageKey}-flow-${flowId}-code-verifier`] : [])];

/**
 * A return with a PKCE code that this browser cannot exchange: the link was opened somewhere else than where it was
 * asked for. Supabase Auth leaves such an address alone, so without this the person would land signed out with no
 * word. An e-mail confirmation is done on the server before the return, so that account is already active.
 */
export function readStrandedCode(href: string, storage: Pick<Storage, 'getItem'>, storageKey: string): AuthCallbackError | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const read = (name: string): string | null => url.searchParams.get(name) ?? hash.get(name);
  if (!read('code')) return null;
  const stranded = verifierKeys(storageKey, read('sb_flow_id')).every((key) => storage.getItem(key) === null);
  return stranded ? { failure: 'otherBrowser', detail: null } : null;
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
  const named = [code, read('error')].find((candidate) => candidate !== null && ERROR_CODE.test(candidate)) ?? null;
  return { failure: code === EXPIRED_LINK_CODE ? 'linkExpired' : 'returnFailed', detail: named };
}
