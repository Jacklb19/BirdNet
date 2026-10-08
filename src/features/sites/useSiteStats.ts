import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../config/api';
import type { Period } from '../../config/contract';
import { useAccountContext } from '../account/accountContext';
import { siteStats, type SiteStats } from './sitesApi';

export type SiteStatsStatus = 'signedOut' | 'offline' | 'loading' | 'ready' | 'error' | 'notFound';

export interface SiteStatsState {
  readonly status: SiteStatsStatus;
  /** The answer for this site and period, or the last one seen in this visit to the app while a new one loads or fails. */
  readonly stats: SiteStats | null;
  readonly retry: () => void;
}

const NOT_FOUND_STATUS = 404;

/**
 * Last statistics per account, site and period while the app is open, so going back from a panel to the list (or
 * switching periods back and forth) shows numbers at once while they are refreshed. The account is part of the key:
 * on a shared phone, someone who signs in after another person must never see that person's sites, even offline.
 */
const recent = new Map<string, SiteStats>();

interface Answer { readonly key: string; readonly stats: SiteStats | null; readonly failure: 'error' | 'notFound' | null }

/**
 * Statistics of one site for one period, fetched when signed in and online. `enabled` lets a caller defer the
 * request (a card still far from the viewport); until then the state reads as loading.
 */
export function useSiteStats(siteId: string, period: Period, online: boolean, enabled = true): SiteStatsState {
  const { session } = useAccountContext();
  const token = session?.access_token ?? null;
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const cacheKey = `${session?.user.id ?? ''}|${siteId}|${period}`;
  const key = `${cacheKey}|${String(attempt)}`;

  useEffect(() => {
    if (!token || !online || !enabled) return;
    let active = true;
    siteStats(token, siteId, period)
      .then((stats) => {
        recent.set(cacheKey, stats);
        if (active) setAnswer({ key, stats, failure: null });
      })
      .catch((error: unknown) => {
        // Sites are private: the API answers "not found" for a site of another account too.
        const failure = error instanceof ApiError && error.status === NOT_FOUND_STATUS ? 'notFound' : 'error';
        if (failure === 'notFound') recent.delete(cacheKey);
        if (active) setAnswer({ key, stats: null, failure });
      });
    return () => { active = false; };
  }, [token, online, enabled, siteId, period, cacheKey, key]);

  const retry = useCallback(() => { setAttempt((value) => value + 1); }, []);

  if (!token) return { status: 'signedOut', stats: null, retry };
  const current = answer?.key === key ? answer : null;
  // A failed answer keeps the numbers remembered for this key; "not found" has already forgotten them.
  const stats = current?.stats ?? recent.get(cacheKey) ?? null;
  if (current) return { status: current.failure ?? 'ready', stats, retry };
  return { status: online ? 'loading' : 'offline', stats, retry };
}
