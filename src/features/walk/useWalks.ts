import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../config/api';
import { useNow } from '../../shared/useNow';
import { useAccountContext } from '../account/accountContext';
import type { StoredWalk, TrackPoint } from '../offline/types';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { useWalkData } from './useWalkData';
import { WALK_HEARTBEAT_MS, WALK_PAGE_SIZE } from './walk.config';
import { trackMeters } from './walkGeometry';
import { fetchAccountWalk, fetchWalkPage, type AccountWalk, type AccountWalkDetail } from './walksApi';
import type { Pin } from './walkPins';
import { walkEnd, walkSongs, type WalkPlace, type WalkSpeciesCount } from './walkSummary';
import { savesWalks } from './walkSync';

const HTTP_NOT_FOUND = 404;

/** Where a walk is kept, as the person is told. */
export type WalkWhere = 'phone' | 'pending' | 'both' | 'account';

export interface WalkView {
  readonly id: string;
  readonly name: string | null;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  /** Null while it may be under way, or when nothing tells when an interrupted one ended. */
  readonly endedAt: number | null;
  /** Still under way: it has no end and was refreshed lately. */
  readonly live: boolean;
  readonly meters: number;
  readonly songs: number;
  readonly species: readonly WalkSpeciesCount[];
  readonly where: WalkWhere;
  /** The path when this phone keeps it; the account's list carries none. */
  readonly track: readonly TrackPoint[] | null;
}

export interface WalkDetailView extends WalkView {
  readonly track: readonly TrackPoint[];
  readonly places: readonly WalkPlace[];
  /** The copy on this phone, if there is one. */
  readonly local: StoredWalk | null;
}

function localWhere(walk: StoredWalk, uploads: boolean, inAccount: boolean): WalkWhere {
  if (inAccount || walk.inAccount || walk.account === 'saved') return 'both';
  return uploads && (walk.account ?? 'pending') === 'pending' ? 'pending' : 'phone';
}

function localView(walk: StoredWalk, pins: readonly Pin[], now: number, uploads: boolean, inAccount: boolean): WalkDetailView {
  const startedAt = Date.parse(walk.startedAt);
  const endedAt = walkEnd(walk, pins, now);
  const live = endedAt === null && Boolean(walk.lastAt);
  // A walk under way counts what was heard so far; one that cannot be closed counts nothing.
  const heard = walkSongs(pins, startedAt, endedAt ?? (live ? now : startedAt - 1));
  return {
    id: walk.id, name: walk.name ?? null, startedAt, endedAt, live, meters: trackMeters(walk.track), songs: heard.songs, species: heard.species,
    where: localWhere(walk, uploads, inAccount), track: walk.track, places: heard.places, local: walk,
  };
}

function accountView(walk: AccountWalk): WalkView {
  return { ...walk, live: false, where: 'account', track: null };
}

type AccountList =
  | { readonly status: 'none' | 'offline' | 'loading' | 'error' }
  | { readonly status: 'ready'; readonly walks: readonly AccountWalk[]; readonly hasMore: boolean; readonly more: 'idle' | 'loading' | 'error' };

export interface WalkList {
  /** Newest first; null while the phone's walks are being read. */
  readonly walks: readonly WalkView[] | null;
  readonly account: AccountList['status'];
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly loadMore: () => void;
}

/**
 * Every walk the person has: the ones on this phone (read offline, with what was heard during each) and the ones in
 * their account, page by page. A walk in both places appears once, with the phone's figures.
 */
export function useWalkList(): WalkList {
  const own = useWalkData();
  const { session } = useAccountContext();
  const { settings } = useOfflineSettings();
  const online = useOnline();
  const now = useNow(WALK_HEARTBEAT_MS);
  const token = session?.access_token ?? null;
  // The last list read for this account; kept while it is read again, so the list does not flash empty.
  const [found, setFound] = useState<{ readonly token: string; readonly list: AccountList } | null>(null);
  // Read the account's first page again whenever a walk of this phone reaches it.
  const saved = own.walks.filter((walk) => walk.account === 'saved').length;

  useEffect(() => {
    if (!token || !online) return;
    const controller = new AbortController();
    fetchWalkPage(token, null, WALK_PAGE_SIZE, controller.signal)
      .then((page) => { setFound({ token, list: { status: 'ready', walks: page.walks, hasMore: page.hasMore, more: 'idle' } }); })
      .catch(() => { if (!controller.signal.aborted) setFound({ token, list: { status: 'error' } }); });
    return () => { controller.abort(); };
  }, [token, online, saved]);

  const account = useMemo((): AccountList => {
    if (!token) return { status: 'none' };
    if (!online) return { status: 'offline' };
    return found?.token === token ? found.list : { status: 'loading' };
  }, [token, online, found]);

  const loadMore = useCallback((): void => {
    if (account.status !== 'ready' || !account.hasMore || account.more === 'loading' || !token) return;
    const before = account.walks.at(-1)?.startedAt ?? null;
    const current = account;
    setFound({ token, list: { ...current, more: 'loading' } });
    fetchWalkPage(token, before, WALK_PAGE_SIZE)
      .then((page) => { setFound({ token, list: { status: 'ready', walks: [...current.walks, ...page.walks], hasMore: page.hasMore, more: 'idle' } }); })
      .catch(() => { setFound({ token, list: { ...current, more: 'error' } }); });
  }, [account, token]);

  const uploads = Boolean(token) && savesWalks(settings ?? {});
  const walks = useMemo(() => {
    if (!own.pins) return null;
    const pins = own.pins;
    const remote = account.status === 'ready' ? account.walks : [];
    const remoteIds = new Set(remote.map((walk) => walk.id));
    const localIds = new Set(own.walks.map((walk) => walk.id));
    const views: WalkView[] = [
      ...own.walks.map((walk) => localView(walk, pins, now, uploads, remoteIds.has(walk.id))),
      ...remote.filter((walk) => !localIds.has(walk.id)).map(accountView),
    ];
    return views.sort((a, b) => b.startedAt - a.startedAt);
  }, [own.pins, own.walks, account, now, uploads]);

  return {
    walks, account: account.status, hasMore: account.status === 'ready' && account.hasMore,
    loadingMore: account.status === 'ready' && account.more === 'loading', loadMore,
  };
}

export type WalkDetailState =
  | { readonly status: 'loading' | 'notFound' | 'error' | 'offline' }
  | { readonly status: 'ready'; readonly walk: WalkDetailView };

/** One walk: from this phone when it keeps it (offline, with its times), otherwise from the account. */
export function useWalkDetail(id: string, reload: number): WalkDetailState {
  const own = useWalkData();
  const { session } = useAccountContext();
  const { settings } = useOfflineSettings();
  const online = useOnline();
  const now = useNow(WALK_HEARTBEAT_MS);
  const token = session?.access_token ?? null;
  const local = own.walks.find((walk) => walk.id === id) ?? null;
  const read = own.pins !== null;
  const [remote, setRemote] = useState<{ readonly id: string; readonly walk: AccountWalkDetail } | { readonly id: string; readonly failed: 'notFound' | 'error' } | null>(null);

  useEffect(() => {
    if (!read || local || !token || !online) return;
    const controller = new AbortController();
    fetchAccountWalk(token, id, controller.signal)
      .then((walk) => { setRemote({ id, walk }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({ id, failed: error instanceof ApiError && error.status === HTTP_NOT_FOUND ? 'notFound' : 'error' });
      });
    return () => { controller.abort(); };
  }, [read, local, token, online, id, reload]);

  const uploads = Boolean(token) && savesWalks(settings ?? {});
  return useMemo((): WalkDetailState => {
    if (!own.pins) return own.error ? { status: 'error' } : { status: 'loading' };
    if (local) return { status: 'ready', walk: localView(local, own.pins, now, uploads, false) };
    if (!token) return { status: 'notFound' };
    if (remote?.id === id) {
      if ('walk' in remote) return { status: 'ready', walk: { ...accountView(remote.walk), track: remote.walk.track, places: remote.walk.places, local: null } };
      return { status: remote.failed };
    }
    return online ? { status: 'loading' } : { status: 'offline' };
  }, [own.pins, own.error, local, now, uploads, token, remote, id, online]);
}
