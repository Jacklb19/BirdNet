import type { GoTrueClient, Session } from '@supabase/auth-js';
import { AUTHENTICATOR_CODE_LENGTH, AUTHENTICATOR_FACTOR_NAME } from './account.constants';

/** Assurance level of a session that gave the code of an authenticator app (Supabase Auth). */
const SECOND_FACTOR_LEVEL = 'aal2';
const VERIFIED = 'verified';

/** What the authenticator app needs to add the account: the QR code (an SVG data URL) and the same secret as text. */
export interface Enrollment {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

/** Claims of an access token, read without checking its signature: the server does, this only decides what to show. */
function claimsOf(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const claims: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
    return typeof claims === 'object' && claims !== null ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Whether this session stopped at the password (or Google) of an account that asks for the authenticator's code:
 * then nothing of the account is reachable until the code is given (ADR-39). The same rule as Supabase's
 * `getAuthenticatorAssuranceLevel`, computed from the session alone so it also works without connection.
 */
export function needsSecondStep(session: Session | null): boolean {
  if (!session) return false;
  const verified = session.user.factors?.some((factor) => factor.status === VERIFIED) ?? false;
  return verified && claimsOf(session.access_token)?.aal !== SECOND_FACTOR_LEVEL;
}

/** Digits only, as authenticator apps show them with a space in the middle. */
export function normalizeCode(typed: string): string {
  return typed.replace(/\D/g, '').slice(0, AUTHENTICATOR_CODE_LENGTH);
}

async function verifiedFactor(auth: GoTrueClient): Promise<string> {
  const { data, error } = await auth.mfa.listFactors();
  if (error) throw error;
  // Supabase lists under `totp` only the verified factors of that type.
  const [factor] = data.totp;
  if (!factor) throw new Error('This account has no authenticator app.');
  return factor.id;
}

async function verify(auth: GoTrueClient, factorId: string, code: string): Promise<void> {
  const { error } = await auth.mfa.challengeAndVerify({ factorId, code: normalizeCode(code) });
  if (error) throw error;
}

/** Whether the account asks for the code at sign-in. */
export async function secondStepEnabled(auth: GoTrueClient): Promise<boolean> {
  const { data, error } = await auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.length > 0;
}

/** Gives the code after the password; the session then reaches the account. */
export async function completeSecondStep(auth: GoTrueClient, code: string): Promise<void> {
  await verify(auth, await verifiedFactor(auth), code);
}

/**
 * Starts adding an authenticator app. An earlier attempt that was never confirmed is removed first: Supabase keeps it
 * as an unverified factor, which asks for nothing but would block the name.
 */
export async function startEnrollment(auth: GoTrueClient): Promise<Enrollment> {
  const listed = await auth.mfa.listFactors();
  if (listed.error) throw listed.error;
  for (const factor of listed.data.all) {
    if (factor.status !== VERIFIED) {
      const { error } = await auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
  }
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: AUTHENTICATOR_FACTOR_NAME });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms the app with its first code; from then on every sign-in asks for one. */
export async function confirmEnrollment(auth: GoTrueClient, factorId: string, code: string): Promise<void> {
  await verify(auth, factorId, code);
}

/** Leaves an enrollment that was not confirmed, so nothing half-done stays in the account. */
export async function cancelEnrollment(auth: GoTrueClient, factorId: string): Promise<void> {
  const { error } = await auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * Turns the second step off. A current code is asked even in a session that already gave one, so that a phone left
 * unlocked is not enough; the session is then renewed so it stops carrying the factor.
 */
export async function disableSecondStep(auth: GoTrueClient, code: string): Promise<void> {
  const factorId = await verifiedFactor(auth);
  await verify(auth, factorId, code);
  const { error } = await auth.mfa.unenroll({ factorId });
  if (error) throw error;
  const refreshed = await auth.refreshSession();
  if (refreshed.error) throw refreshed.error;
}
