/**
 * Sign-in with Google through the browser's own account chooser (FedCM). The consent then names this site instead
 * of the Supabase project domain, and no Google script, iframe or pop-up runs inside the page, which the app's
 * cross-origin isolation (COOP/COEP) would block. Browsers without FedCM use the redirect flow instead.
 */

/** Google's FedCM configuration, as published for "Sign in with Google". */
const GOOGLE_FEDCM_CONFIG_URL = 'https://accounts.google.com/gsi/fedcm.json';

/** Bytes of entropy of the nonce that ties the ID token to this sign-in attempt. */
const NONCE_BYTES = 32;

// FedCM is not in TypeScript's DOM library yet; only what this module uses is declared.
interface IdentityProviderRequest {
  readonly configURL: string;
  readonly clientId: string;
  /** Read by browsers before the nonce moved into `params`. */
  readonly nonce: string;
  readonly params: { readonly nonce: string };
}
interface IdentityCredentialRequest {
  readonly identity: { readonly providers: readonly IdentityProviderRequest[]; readonly mode: 'active' };
}
interface IdentityCredential extends Credential {
  readonly token: string;
}

export interface GoogleIdToken {
  readonly token: string;
  /** The unhashed nonce; Supabase hashes it and compares it with the one inside the token. */
  readonly nonce: string;
}

/** Whether this browser can show its own account chooser. */
export function supportsFederatedSignIn(): boolean {
  return typeof window !== 'undefined' && 'IdentityCredential' in window && 'credentials' in navigator;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A random nonce and its SHA-256, in hexadecimal: Google receives the hash, Supabase the original. */
export async function nonceWithHash(): Promise<{ readonly nonce: string; readonly hashed: string }> {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  return { nonce, hashed: hex(new Uint8Array(digest)) };
}

/**
 * The person closing the chooser is not a failure: the browser reports it as `NotAllowedError` (or `AbortError`),
 * and nothing else should happen. Any other error means the chooser itself could not work here.
 */
export function wasDismissed(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}

/** Asks the browser for a Google ID token for `clientId`. Must be called from a click (user activation). */
export async function requestGoogleIdToken(clientId: string): Promise<GoogleIdToken> {
  const { nonce, hashed } = await nonceWithHash();
  const request: IdentityCredentialRequest = {
    identity: { mode: 'active', providers: [{ configURL: GOOGLE_FEDCM_CONFIG_URL, clientId, nonce: hashed, params: { nonce: hashed } }] },
  };
  const credential = await navigator.credentials.get(request as CredentialRequestOptions) as IdentityCredential | null;
  if (!credential?.token) throw new Error('No Google credential.');
  return { token: credential.token, nonce };
}
