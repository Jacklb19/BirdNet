import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { navigateTo } from '../../app/routes';
import { config } from '../../config/env';
import { scheduleSynchronization } from '../offline/offlineClient';
import { bindSyncSession, keepSitesOf, listDetections } from '../offline/queueStore';
import {
  GENERIC_ACCOUNT_FAILURE, GOOGLE_PROVIDER, PASSWORD_RECOVERY_EVENT, SIGNED_OUT_EVENT, type AccountFailure,
} from './account.constants';
import { requestGoogleIdToken, supportsFederatedSignIn, wasDismissed } from './googleSignIn';
import { encodeAvatar, fetchProfile, normalizeAlias, updateProfile, uploadAvatar, type Profile } from './profileApi';
import { accountFailure, supabase, toSyncSession } from './supabaseClient';

export type AccountError = AccountFailure | null;

export interface AccountState {
  readonly configured: boolean;
  readonly session: Session | null;
  /** Alias and photo from the API; null until loaded (or offline). */
  readonly profile: Profile | null;
  /** A password-reset link was opened: the account screen asks for the new password. */
  readonly recovering: boolean;
  /** Local detections saved before any sign-in; they are never reassigned without consent. */
  readonly unownedCount: number;
  readonly claimed: boolean;
  readonly error: AccountError;
  readonly working: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Opens the browser's Google account chooser; where there is none, leaves for Google's page and Supabase brings the person back. */
  signInWithGoogle(): Promise<void>;
  /** Resolves true when the account still needs email confirmation. */
  signUp(email: string, password: string): Promise<boolean>;
  /** Resolves true when the reset e-mail was requested. */
  requestPasswordReset(email: string): Promise<boolean>;
  /** Resolves true when the new password was saved. */
  updatePassword(password: string): Promise<boolean>;
  signOut(): Promise<void>;
  saveAlias(alias: string): Promise<boolean>;
  saveAvatar(file: Blob): Promise<boolean>;
  claimLocal(): Promise<void>;
  declineClaim(): void;
}

/**
 * Where e-mail links and Google return: the configured URL (resolved against this origin), or this origin. It must be
 * listed under "Redirect URLs" in Supabase Auth (docs/despliegue.md).
 */
function authRedirectUrl(): string {
  return config.authRedirectUrl === null ? window.location.origin : new URL(config.authRedirectUrl, window.location.origin).href;
}

function requireClient(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Accounts are not configured.');
  return supabase;
}

async function countUnowned(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return (await listDetections()).filter((row) => !row.owner).length;
}

/** One instance per app: keeps the service worker's sync session in step with Supabase Auth. */
export function useAccount(): AccountState {
  const [session, setSession] = useState<Session | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<{ readonly userId: string; readonly profile: Profile } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [unownedCount, setUnownedCount] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<AccountError>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const subscription = { active: true };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!subscription.active) return;
      setSession(next);
      if (event === PASSWORD_RECOVERY_EVENT) {
        setRecovering(true);
        navigateTo({ name: 'account' });
      }
      // Token refreshes must reach IndexedDB too, or background sync stops when the hour-long token expires.
      void (async () => {
        if (typeof indexedDB !== 'undefined') {
          await bindSyncSession(toSyncSession(next));
          // The cached sites belong to one account (privacy on a shared phone): forgotten on sign-out or when another
          // account signs in. A missing session alone is not a sign-out: a stored session that cannot be renewed
          // offline also starts without one, and the field still needs the saved sites.
          if (next || event === SIGNED_OUT_EVENT) await keepSitesOf(next?.user.id ?? null);
        }
        if (next) await scheduleSynchronization();
        const unowned = next ? await countUnowned() : 0;
        if (subscription.active) setUnownedCount(unowned);
      })().catch(() => { if (subscription.active) setError(GENERIC_ACCOUNT_FAILURE); });
    });
    return () => { subscription.active = false; data.subscription.unsubscribe(); };
  }, []);

  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;

  // The profile follows the signed-in account; offline it simply stays unknown and the e-mail is shown instead.
  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    fetchProfile(token).then((loaded) => { if (active) setLoadedProfile({ userId, profile: loaded }); }).catch(() => undefined);
    return () => { active = false; };
  }, [token, userId]);
  const profile = loadedProfile && loadedProfile.userId === userId ? loadedProfile.profile : null;
  const setProfile = useCallback((next: Profile): void => { if (userId) setLoadedProfile({ userId, profile: next }); }, [userId]);

  const run = useCallback(async <T,>(action: () => Promise<T>, fallback: T): Promise<T> => {
    setWorking(true);
    setError(null);
    try { return await action(); }
    catch (caught) {
      setError(accountFailure(caught));
      return fallback;
    } finally { setWorking(false); }
  }, []);

  const signIn = useCallback((email: string, password: string) => run(async () => {
    const { error: failure } = await requireClient().auth.signInWithPassword({ email, password });
    if (failure) throw failure;
  }, undefined), [run]);

  const signInWithGoogle = useCallback(() => run(async () => {
    const auth = requireClient().auth;
    if (config.googleClientId && supportsFederatedSignIn()) {
      try {
        const { token: idToken, nonce } = await requestGoogleIdToken(config.googleClientId);
        const { error: failure } = await auth.signInWithIdToken({ provider: GOOGLE_PROVIDER, token: idToken, nonce });
        if (failure) throw failure;
        return;
      } catch (caught) {
        // Closing the chooser is the person's answer; any other failure falls back to the redirect, which always works.
        if (wasDismissed(caught)) return;
      }
    }
    const { error: failure } = await auth.signInWithOAuth({ provider: GOOGLE_PROVIDER, options: { redirectTo: authRedirectUrl() } });
    if (failure) throw failure;
  }, undefined), [run]);

  const signUp = useCallback((email: string, password: string) => run(async () => {
    const { data, error: failure } = await requireClient().auth.signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
    if (failure) throw failure;
    return data.session === null;
  }, false), [run]);

  const requestPasswordReset = useCallback((email: string) => run(async () => {
    const { error: failure } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    if (failure) throw failure;
    return true;
  }, false), [run]);

  const updatePassword = useCallback((password: string) => run(async () => {
    const { error: failure } = await requireClient().auth.updateUser({ password });
    if (failure) throw failure;
    setRecovering(false);
    return true;
  }, false), [run]);

  const signOut = useCallback(() => run(async () => {
    if (!supabase) return;
    setClaimed(false);
    setDismissed(false);
    setRecovering(false);
    const { error: failure } = await supabase.auth.signOut();
    if (failure) throw failure;
  }, undefined), [run]);

  const saveAlias = useCallback((alias: string) => run(async () => {
    if (!token) return false;
    setProfile(await updateProfile(token, { alias: normalizeAlias(alias) }));
    return true;
  }, false), [run, token, setProfile]);

  const saveAvatar = useCallback((file: Blob) => run(async () => {
    if (!token || !userId) return false;
    setProfile(await uploadAvatar(token, userId, await encodeAvatar(file)));
    return true;
  }, false), [run, token, userId, setProfile]);

  const claimLocal = useCallback(() => run(async () => {
    const sync = toSyncSession(session);
    if (!sync) return;
    await bindSyncSession(sync, true);
    setUnownedCount(0);
    setClaimed(true);
    await scheduleSynchronization();
  }, undefined), [run, session]);

  const declineClaim = useCallback(() => { setDismissed(true); }, []);

  return {
    configured: supabase !== null, session, profile, recovering, unownedCount: dismissed ? 0 : unownedCount, claimed, error, working,
    signIn, signInWithGoogle, signUp, requestPasswordReset, updatePassword, signOut, saveAlias, saveAvatar, claimLocal, declineClaim,
  };
}
