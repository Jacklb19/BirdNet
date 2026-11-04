import { useCallback, useEffect, useState } from 'react';
import type { GoTrueClient, Session } from '@supabase/auth-js';
import { navigateTo, routeHash } from '../../app/routes';
import { config } from '../../config/env';
import { scheduleSynchronization } from '../offline/offlineClient';
import { bindSyncSession, keepChoicesOf, keepSitesOf, listDetections } from '../offline/queueStore';
import {
  GENERIC_ACCOUNT_FAILURE, GOOGLE_PROVIDER, PASSWORD_RECOVERY_EVENT, SIGNED_IN_EVENT, SIGNED_OUT_EVENT, type AccountFailure,
} from './account.constants';
import { deleteAccount as deleteAccountEverywhere, type DeletionOutcome } from './accountDeletion';
import { readAuthCallbackError, readStrandedCode } from './authCallback';
import { requestGoogleIdToken, supportsFederatedSignIn, wasDismissed } from './googleSignIn';
import { encodeAvatar, fetchProfile, normalizeAlias, updateProfile, uploadAvatar, type Profile } from './profileApi';
import {
  cancelEnrollment, completeSecondStep, confirmEnrollment, disableSecondStep, needsSecondStep, secondStepEnabled, startEnrollment,
  type Enrollment,
} from './secondFactor';
import { accountFailure, accountsConfigured, authClient, sessionStorageKey, toSyncSession } from './supabaseClient';
import { identityOf, readStoredIdentity, type Identity } from './storedIdentity';
import { claimWalks } from '../walk/walkStore';

export type AccountError = AccountFailure | null;

/**
 * Part of the account screen an error belongs to, so each failure is shown once, beside what failed: signing in or
 * the background work after it, the name and photo, the new password, the authenticator app, or the password typed
 * again before deleting the account.
 */
export type AccountErrorScope = 'session' | 'profile' | 'recovery' | 'secondStep' | 'identity';

export interface AccountState {
  readonly configured: boolean;
  /**
   * Who is signed in on this phone: the live session's account or, offline with a token that could not be renewed,
   * the account of the session Auth keeps (ADR-45). The app opens only with one; screens that call the API use `session`.
   */
  readonly identity: Identity | null;
  /** Whether Auth has said, at least once, whether a session exists; until then a missing identity is not yet an answer. */
  readonly ready: boolean;
  /** The signed-in session; null too while an account with the second step on waits for the authenticator's code. */
  readonly session: Session | null;
  /** Signed in with the password (or Google) of an account that asks for the authenticator's code (ADR-39). */
  readonly awaitingCode: boolean;
  /** Whether the account asks for that code at sign-in; null until known (or offline). */
  readonly secondStep: boolean | null;
  /** Resolves true when the code let the session in. */
  verifySecondStep(code: string): Promise<boolean>;
  /** Starts adding an authenticator app; null when it could not start. */
  startSecondStep(): Promise<Enrollment | null>;
  /** Resolves true when the first code confirmed the app. */
  confirmSecondStep(factorId: string, code: string): Promise<boolean>;
  cancelSecondStep(factorId: string): Promise<void>;
  /** Resolves true when the second step was turned off with a current code. */
  turnOffSecondStep(code: string): Promise<boolean>;
  /** Alias and photo from the API; null until loaded (or offline). */
  readonly profile: Profile | null;
  /** A password-reset link was opened: the account screen asks for the new password. */
  readonly recovering: boolean;
  /** Local detections saved before accounts were required; they are never reassigned without consent. */
  readonly unownedCount: number;
  readonly claimed: boolean;
  readonly error: AccountError;
  readonly errorScope: AccountErrorScope;
  /** What the account service said about `error`, when it came back from Google or an e-mail link with a failure. */
  readonly errorDetail: string | null;
  /** Forgets the error, when the person leaves what failed (cancels it or switches to another form). */
  clearError(): void;
  readonly working: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Opens the browser's Google account chooser; where there is none, leaves for Google's page and Supabase brings the person back. */
  signInWithGoogle(): Promise<void>;
  /** Resolves true when the account still needs email confirmation. */
  signUp(email: string, password: string): Promise<boolean>;
  /** Resolves true when the code of the confirmation e-mail activated the account; the session starts with it. */
  confirmSignUp(email: string, code: string): Promise<boolean>;
  /** Resolves true when a new confirmation e-mail was requested. */
  resendSignUpCode(email: string): Promise<boolean>;
  /** Resolves true when the password, typed again, renewed the sign-in (deleting the account asks for a recent one). */
  confirmIdentity(password: string): Promise<boolean>;
  /** Resolves true when the reset e-mail was requested. */
  requestPasswordReset(email: string): Promise<boolean>;
  /** Resolves true when the new password was saved. */
  updatePassword(password: string): Promise<boolean>;
  signOut(): Promise<void>;
  /**
   * Deletes the account and everything in it, then what this phone keeps of it, and ends the session. Resolves how
   * far it got, or null when the account could not be deleted (nothing was).
   */
  deleteAccount(): Promise<DeletionOutcome | null>;
  /** How the last deletion of an account ended in this visit to the app; shown once the session is gone. */
  readonly deleted: DeletionOutcome | null;
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

/**
 * Read once, when the app loads: the address the browser arrived at. A return that failed is then shown on the
 * account screen and taken out of the address, so reloading or sharing the page does not repeat it.
 */
const returnError = typeof window === 'undefined' ? null
  : readAuthCallbackError(window.location.href) ?? (config.supabase ? readStrandedCode(window.location.href, localStorage, sessionStorageKey(config.supabase.url)) : null);

async function requireClient(): Promise<GoTrueClient> {
  const auth = await authClient();
  if (!auth) throw new Error('Accounts are not configured.');
  return auth;
}

// Asked for as soon as the app starts, not when a screen first needs it (see authClient).
if (typeof window !== 'undefined') void authClient();

/** The identity of the session this phone keeps, read again after every change Auth reports. */
function storedIdentity(): Identity | null {
  if (!config.supabase || typeof localStorage === 'undefined') return null;
  try { return readStoredIdentity(localStorage, sessionStorageKey(config.supabase.url)); } catch { return null; }
}

async function countUnowned(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return (await listDetections()).filter((row) => !row.owner).length;
}

/** One instance per app: keeps the service worker's sync session in step with Supabase Auth. */
export function useAccount(): AccountState {
  const [signedIn, setSignedIn] = useState<Session | null>(null);
  // Read at once, so an app opened offline (or before Auth answers) shows the person's screens without waiting.
  const [stored, setStored] = useState<Identity | null>(storedIdentity);
  const [ready, setReady] = useState(!accountsConfigured);
  const [secondStepState, setSecondStepState] = useState<{ readonly userId: string; readonly enabled: boolean } | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<{ readonly userId: string; readonly profile: Profile } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [unownedCount, setUnownedCount] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<AccountError>(returnError?.failure ?? null);
  const [errorScope, setErrorScope] = useState<AccountErrorScope>('session');
  const [errorDetail, setErrorDetail] = useState<string | null>(returnError?.detail ?? null);
  const [working, setWorking] = useState(false);
  const [deleted, setDeleted] = useState<DeletionOutcome | null>(null);

  useEffect(() => {
    if (!returnError) return;
    // Without a reload: the query goes away and the hash becomes the account route, which the router is told about.
    window.history.replaceState(null, '', `${window.location.pathname}${routeHash({ name: 'account' })}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  useEffect(() => {
    const subscription = { active: true, unsubscribe: (): void => undefined };
    void authClient().then((auth) => {
      if (!auth || !subscription.active) return;
      const { data } = auth.onAuthStateChange((event, signedInNow) => {
        if (!subscription.active) return;
        setSignedIn(signedInNow);
        const keeps = storedIdentity();
        setStored(keeps);
        setReady(true);
        if (event === PASSWORD_RECOVERY_EVENT) {
          setRecovering(true);
          navigateTo({ name: 'account' });
        }
        // An account that asks for the code is out of reach until it is given: sync waits without a session.
        const waiting = needsSecondStep(signedInNow);
        if (waiting && event === SIGNED_IN_EVENT) navigateTo({ name: 'account' });
        follow(event, waiting ? null : signedInNow);
      });
      subscription.unsubscribe = () => { data.subscription.unsubscribe(); };
    }, () => {
      // Auth's code could not load (offline before it was ever cached): the stored session, if any, is all there is.
      if (subscription.active) setReady(true);
    });
    const follow = (event: string, next: Session | null): void => {
      // Token refreshes must reach IndexedDB too, or background sync stops when the hour-long token expires.
      void (async () => {
        if (typeof indexedDB !== 'undefined') {
          // Only a sign-out lets go of the bound session. A session kept but not renewable offline starts without one:
          // the bound one (expired, so it sends nothing) stays, and what is recorded meanwhile still belongs to the
          // person (ADR-45). Renewed, it is bound again.
          if (next || event === SIGNED_OUT_EVENT) await bindSyncSession(toSyncSession(next));
          // The cached sites belong to one account (privacy on a shared phone): forgotten on sign-out or when another
          // account signs in. A missing session alone is not a sign-out: a stored session that cannot be renewed
          // offline also starts without one, and the field still needs the saved sites. The answers about what leaves
          // the phone follow the same account.
          if (next || event === SIGNED_OUT_EVENT) {
            await keepSitesOf(next?.user.id ?? null);
            await keepChoicesOf(next?.user.id ?? null);
          }
        }
        if (next) await scheduleSynchronization();
        const unowned = next ? await countUnowned() : 0;
        if (subscription.active) setUnownedCount(unowned);
      })().catch(() => {
        if (!subscription.active) return;
        setErrorScope('session');
        setError(GENERIC_ACCOUNT_FAILURE);
      });
    };
    return () => { subscription.active = false; subscription.unsubscribe(); };
  }, []);

  const awaitingCode = needsSecondStep(signedIn);
  const session = awaitingCode ? null : signedIn;
  const live = identityOf(session);
  const identity = live ?? (awaitingCode || signedIn ? null : stored);
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;

  // Whether the account asks for the code, for its switch in Account; read again with each new token.
  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    requireClient().then(secondStepEnabled)
      .then((enabled) => { if (active) setSecondStepState({ userId, enabled }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [token, userId]);
  const secondStep = secondStepState && secondStepState.userId === userId ? secondStepState.enabled : null;

  // The profile follows the signed-in account; offline it simply stays unknown and the e-mail is shown instead.
  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    fetchProfile(token).then((loaded) => { if (active) setLoadedProfile({ userId, profile: loaded }); }).catch(() => undefined);
    return () => { active = false; };
  }, [token, userId]);
  const profile = loadedProfile && loadedProfile.userId === userId ? loadedProfile.profile : null;
  const setProfile = useCallback((next: Profile): void => { if (userId) setLoadedProfile({ userId, profile: next }); }, [userId]);

  const run = useCallback(async <T,>(action: () => Promise<T>, fallback: T, scope: AccountErrorScope = 'session'): Promise<T> => {
    setWorking(true);
    setError(null);
    setErrorDetail(null);
    try { return await action(); }
    catch (caught) {
      setErrorScope(scope);
      setError(accountFailure(caught));
      return fallback;
    } finally { setWorking(false); }
  }, []);

  const clearError = useCallback((): void => { setError(null); setErrorDetail(null); }, []);

  const signIn = useCallback((email: string, password: string) => run(async () => {
    const { error: failure } = await (await requireClient()).signInWithPassword({ email, password });
    if (failure) throw failure;
  }, undefined), [run]);

  const signInWithGoogle = useCallback(() => run(async () => {
    const auth = await requireClient();
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
    const { data, error: failure } = await (await requireClient()).signUp({ email, password, options: { emailRedirectTo: authRedirectUrl() } });
    if (failure) throw failure;
    return data.session === null;
  }, false), [run]);

  // The e-mail carries a code and the link; the code works on any device, the link only where it is opened.
  const confirmSignUp = useCallback((email: string, code: string) => run(async () => {
    const { error: failure } = await (await requireClient()).verifyOtp({ email, token: code, type: 'email' });
    if (failure) throw failure;
    return true;
  }, false), [run]);

  const resendSignUpCode = useCallback((email: string) => run(async () => {
    const { error: failure } = await (await requireClient()).resend({ type: 'signup', email, options: { emailRedirectTo: authRedirectUrl() } });
    if (failure) throw failure;
    return true;
  }, false), [run]);

  const email = session?.user.email ?? null;
  const confirmIdentity = useCallback((password: string) => run(async () => {
    if (!email) return false;
    const { error: failure } = await (await requireClient()).signInWithPassword({ email, password });
    if (failure) throw failure;
    return true;
  }, false, 'identity'), [run, email]);

  const requestPasswordReset = useCallback((email: string) => run(async () => {
    const { error: failure } = await (await requireClient()).resetPasswordForEmail(email, { redirectTo: authRedirectUrl() });
    if (failure) throw failure;
    return true;
  }, false), [run]);

  const updatePassword = useCallback((password: string) => run(async () => {
    const { error: failure } = await (await requireClient()).updateUser({ password });
    if (failure) throw failure;
    setRecovering(false);
    return true;
  }, false, 'recovery'), [run]);

  const signOut = useCallback(() => run(async () => {
    const auth = await authClient();
    if (!auth) return;
    setClaimed(false);
    setDismissed(false);
    setRecovering(false);
    // This device only: signing out of every device at once was neither asked for nor said (audit of 2026-11-02).
    const { error: failure } = await auth.signOut({ scope: 'local' });
    if (failure) throw failure;
  }, undefined), [run]);

  // Not through `run`: the deletion screen reports its own failure, next to the button that was pressed.
  const deleteAccount = useCallback(async (): Promise<DeletionOutcome | null> => {
    const auth = await authClient();
    if (!auth || !token || !userId) return null;
    setWorking(true);
    try {
      const outcome = await deleteAccountEverywhere(token, userId);
      setClaimed(false);
      setDismissed(false);
      setRecovering(false);
      setDeleted(outcome);
      // The user no longer exists, so only this browser's session is ended; the server has nothing left to revoke.
      await auth.signOut({ scope: 'local' }).catch(() => undefined);
      return outcome;
    } catch {
      return null;
    } finally {
      setWorking(false);
    }
  }, [token, userId]);

  const saveAlias = useCallback((alias: string) => run(async () => {
    if (!token) return false;
    setProfile(await updateProfile(token, { alias: normalizeAlias(alias) }));
    return true;
  }, false, 'profile'), [run, token, setProfile]);

  const saveAvatar = useCallback((file: Blob) => run(async () => {
    if (!token || !userId) return false;
    setProfile(await uploadAvatar(token, userId, await encodeAvatar(file)));
    return true;
  }, false, 'profile'), [run, token, userId, setProfile]);

  const claimLocal = useCallback(() => run(async () => {
    const sync = toSyncSession(session);
    if (!sync) return;
    await bindSyncSession(sync, true);
    await claimWalks(sync.userId);
    setUnownedCount(0);
    setClaimed(true);
    await scheduleSynchronization();
  }, undefined), [run, session]);

  const declineClaim = useCallback(() => { setDismissed(true); }, []);

  const verifySecondStep = useCallback((code: string) => run(async () => {
    await completeSecondStep(await requireClient(), code);
    return true;
  }, false, 'secondStep'), [run]);

  const startSecondStep = useCallback(() => run(async () => startEnrollment(await requireClient()), null, 'secondStep'), [run]);

  const confirmSecondStep = useCallback((factorId: string, code: string) => run(async () => {
    await confirmEnrollment(await requireClient(), factorId, code);
    if (userId) setSecondStepState({ userId, enabled: true });
    return true;
  }, false, 'secondStep'), [run, userId]);

  const cancelSecondStep = useCallback(async (factorId: string): Promise<void> => {
    // Best effort: an enrollment left behind is removed the next time one starts.
    await cancelEnrollment(await requireClient(), factorId).catch(() => undefined);
  }, []);

  const turnOffSecondStep = useCallback((code: string) => run(async () => {
    await disableSecondStep(await requireClient(), code);
    if (userId) setSecondStepState({ userId, enabled: false });
    return true;
  }, false, 'secondStep'), [run, userId]);

  return {
    configured: accountsConfigured, identity, ready, session, awaitingCode, secondStep, verifySecondStep, startSecondStep, confirmSecondStep, cancelSecondStep,
    turnOffSecondStep, profile, recovering, unownedCount: dismissed ? 0 : unownedCount, claimed, error, errorScope, errorDetail, clearError, working,
    signIn, signInWithGoogle, signUp, confirmSignUp, resendSignUpCode, confirmIdentity, requestPasswordReset, updatePassword, signOut, deleteAccount, deleted, saveAlias, saveAvatar, claimLocal, declineClaim,
  };
}
