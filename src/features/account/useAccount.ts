import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { config } from '../../config/env';
import { scheduleSynchronization } from '../offline/offlineClient';
import { bindSyncSession, listDetections } from '../offline/queueStore';
import { GENERIC_ACCOUNT_FAILURE, type AccountFailure } from './account.constants';
import { accountFailure, supabase, toSyncSession } from './supabaseClient';

export type AccountError = AccountFailure | null;

export interface AccountState {
  readonly configured: boolean;
  readonly session: Session | null;
  /** Local detections saved before any sign-in; they are never reassigned without consent. */
  readonly unownedCount: number;
  readonly claimed: boolean;
  readonly error: AccountError;
  readonly working: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Resolves true when the account still needs email confirmation. */
  signUp(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
  claimLocal(): Promise<void>;
  declineClaim(): void;
}

/** Where the confirmation e-mail returns: the configured URL (resolved against this origin), or this origin. */
function emailRedirectUrl(): string {
  return config.authRedirectUrl === null ? window.location.origin : new URL(config.authRedirectUrl, window.location.origin).href;
}

async function countUnowned(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  return (await listDetections()).filter((row) => !row.owner).length;
}

/** One instance per app: keeps the service worker's sync session in step with Supabase Auth. */
export function useAccount(): AccountState {
  const [session, setSession] = useState<Session | null>(null);
  const [unownedCount, setUnownedCount] = useState(0);
  const [claimed, setClaimed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<AccountError>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const subscription = { active: true };
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!subscription.active) return;
      setSession(next);
      // Token refreshes must reach IndexedDB too, or background sync stops when the hour-long token expires.
      void (async () => {
        if (typeof indexedDB !== 'undefined') await bindSyncSession(toSyncSession(next));
        if (next) await scheduleSynchronization();
        const unowned = next ? await countUnowned() : 0;
        if (subscription.active) setUnownedCount(unowned);
      })().catch(() => { if (subscription.active) setError(GENERIC_ACCOUNT_FAILURE); });
    });
    return () => { subscription.active = false; data.subscription.unsubscribe(); };
  }, []);

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
    if (!supabase) throw new Error('Accounts are not configured.');
    const { error: failure } = await supabase.auth.signInWithPassword({ email, password });
    if (failure) throw failure;
  }, undefined), [run]);

  const signUp = useCallback((email: string, password: string) => run(async () => {
    if (!supabase) throw new Error('Accounts are not configured.');
    const { data, error: failure } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: emailRedirectUrl() } });
    if (failure) throw failure;
    return data.session === null;
  }, false), [run]);

  const signOut = useCallback(() => run(async () => {
    if (!supabase) return;
    setClaimed(false);
    setDismissed(false);
    const { error: failure } = await supabase.auth.signOut();
    if (failure) throw failure;
  }, undefined), [run]);

  const claimLocal = useCallback(() => run(async () => {
    const sync = toSyncSession(session);
    if (!sync) return;
    await bindSyncSession(sync, true);
    setUnownedCount(0);
    setClaimed(true);
    await scheduleSynchronization();
  }, undefined), [run, session]);

  const declineClaim = useCallback(() => { setDismissed(true); }, []);

  return { configured: supabase !== null, session, unownedCount: dismissed ? 0 : unownedCount, claimed, error, working, signIn, signUp, signOut, claimLocal, declineClaim };
}
