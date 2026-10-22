import { useEffect, useState } from 'react';
import { fetchWalkPaths, type AccountWalkPath } from '../walk/walksApi';
import { MAP_ACCOUNT_WALKS } from './map.config';

const NONE: readonly AccountWalkPath[] = Object.freeze([]);

/**
 * The newest walks of the account, for "Mi mapa" to draw those that are not on this phone (another phone, or data
 * deleted here). Kept in memory only: with no connection or no session the map shows what the phone has.
 */
export function useAccountWalkPaths(token: string | null, userId: string | null, online: boolean): readonly AccountWalkPath[] {
  const [loaded, setLoaded] = useState<{ readonly userId: string; readonly walks: readonly AccountWalkPath[] } | null>(null);
  const known = loaded !== null && loaded.userId === userId;

  useEffect(() => {
    // Read once per account and visit; a token refresh alone does not read it again.
    if (!token || !userId || !online || known) return;
    const controller = new AbortController();
    void (async () => {
      const walks: AccountWalkPath[] = [];
      let before: number | null = null;
      for (;;) {
        const page = await fetchWalkPaths(token, before, controller.signal);
        walks.push(...page.walks);
        const last = page.walks.at(-1);
        if (!page.hasMore || !last || walks.length >= MAP_ACCOUNT_WALKS) break;
        before = last.startedAt;
      }
      setLoaded({ userId, walks: walks.slice(0, MAP_ACCOUNT_WALKS) });
    })().catch(() => undefined);
    return () => { controller.abort(); };
  }, [token, userId, online, known]);

  return known ? loaded.walks : NONE;
}
