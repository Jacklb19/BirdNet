import { useAccountResource, type AccountResource } from '../../shared/useAccountResource';
import { fetchWalkPaths, type AccountWalkPath } from '../walk/walksApi';
import { MAP_ACCOUNT_WALKS } from './map.config';

const NONE: readonly AccountWalkPath[] = Object.freeze([]);

/**
 * The newest walks of the account, for "Mi mapa" to draw those that are not on this phone (another phone, or data
 * deleted here). Kept in memory only: with no connection or no session the map shows what the phone has.
 */
async function load(token: string, signal: AbortSignal): Promise<{ data: readonly AccountWalkPath[]; limited: boolean }> {
  const walks: AccountWalkPath[] = [];
  let before: number | null = null;
  let afterId: string | undefined;
  const cursors = new Set<string>();
  for (;;) {
    const page = await fetchWalkPaths(token, before, signal, afterId);
    walks.push(...page.walks);
    const last = page.walks.at(-1);
    if (!page.hasMore || walks.length >= MAP_ACCOUNT_WALKS) return { data: walks.slice(0, MAP_ACCOUNT_WALKS), limited: page.hasMore || walks.length > MAP_ACCOUNT_WALKS };
    if (!last || cursors.has(last.id)) throw new Error('Walk pagination did not advance.');
    cursors.add(last.id);
    before = last.startedAt;
    afterId = last.id;
  }
}

export function useAccountWalkPaths(token: string | null, userId: string | null, online: boolean): AccountResource<readonly AccountWalkPath[]> {
  return useAccountResource(token, userId, online, NONE, load);
}
