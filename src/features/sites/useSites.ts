import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccountContext } from '../account/accountContext';
import { approximateLocation } from '../offline/queuePolicy';
import { setCachedSites } from '../offline/queueStore';
import type { CachedSite, OfflineSettings } from '../offline/types';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { createSite, listSites } from './sitesApi';

export interface SitesState {
  /** Sites as last fetched online; available offline so a site can be chosen in the field. */
  readonly sites: readonly CachedSite[];
  /** Site that new detections are attributed to, if any. */
  readonly active: CachedSite | null;
  /** The saved list has been read (or nothing can be saved): until then an empty list means "not known yet". */
  readonly ready: boolean;
  /** Creating and refreshing sites needs an account and a connection; choosing one does not. */
  readonly canEdit: boolean;
  readonly loading: boolean;
  /** The last refresh failed; the saved list is still shown. A failed creation never sets it. */
  readonly refreshError: boolean;
  readonly select: (siteId: string | null) => Promise<boolean>;
  readonly refresh: () => Promise<void>;
  /**
   * Resolves null when the site could not be created. The form that asked reports it, so no shared flag can
   * outlive the form or be mistaken for a failed refresh.
   */
  readonly create: (name: string, location: { latitude: number; longitude: number }) => Promise<CachedSite | null>;
}

const NO_SITES: readonly CachedSite[] = Object.freeze([]);

/**
 * The saved list belongs to the account that fetched it. Signing out or another account signing in clears it
 * (`keepSitesOf`, called by the account hook); until that write lands, a list owned by someone else is hidden.
 * Without a known session (signed out, or a stored session that could not be renewed offline) the saved list is
 * shown, so a site can still be chosen in the field.
 */
function visibleSites(settings: OfflineSettings | null, userId: string | null): readonly CachedSite[] {
  if (!settings?.sites) return NO_SITES;
  return userId !== null && settings.sitesOwner !== userId ? NO_SITES : settings.sites;
}

/** The request in flight, shared by every screen so the automatic refresh and a page's own never fetch twice. */
let inflight: { readonly userId: string; readonly request: Promise<void> } | null = null;
/** Account whose list was already refreshed automatically in this page load. */
let autoRefreshedFor: string | null = null;

function fetchSites(token: string, userId: string): Promise<void> {
  if (inflight?.userId === userId) return inflight.request;
  const request: Promise<void> = listSites(token)
    // A request overtaken by another account, or by signing out, never stores its list.
    .then(async (list) => { if (inflight?.request === request) await setCachedSites(list, userId); })
    .finally(() => { if (inflight?.request === request) inflight = null; });
  inflight = { userId, request };
  return request;
}

/** Monitoring sites of the signed-in person, with the device cache and the active-site choice. */
export function useSites(): SitesState {
  const { session } = useAccountContext();
  const online = useOnline();
  const { settings, error: settingsError, update } = useOfflineSettings();
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const ready = settings !== null || settingsError || typeof indexedDB === 'undefined';
  const sites = useMemo(() => visibleSites(settings, userId), [settings, userId]);
  const activeSiteId = settings?.activeSiteId ?? null;
  const active = useMemo(() => sites.find((site) => site.id === activeSiteId) ?? null, [sites, activeSiteId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token || !userId || !online) return;
    setLoading(true);
    setRefreshError(false);
    try {
      await fetchSites(token, userId);
    } catch {
      setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, [token, userId, online]);

  // Once per account and page load, as soon as there is a session and a connection: the pickers then offer the
  // sites created on other devices without a visit to Sites. It runs in the background, without this screen's
  // loading or error state (Sites joins the same request through `refresh`); a failure lets a later screen or
  // reconnection retry.
  useEffect(() => {
    if (!userId) {
      autoRefreshedFor = null;
      inflight = null;
      return;
    }
    if (!token || !online || autoRefreshedFor === userId) return;
    autoRefreshedFor = userId;
    fetchSites(token, userId).catch(() => { if (autoRefreshedFor === userId) autoRefreshedFor = null; });
  }, [userId, token, online]);

  const create = useCallback(async (name: string, location: { latitude: number; longitude: number }): Promise<CachedSite | null> => {
    if (!token || !userId) return null;
    try {
      // Only the ~100 m cell ever leaves the device, as for detections.
      const site = await createSite(token, name.trim(), approximateLocation(location.latitude, location.longitude));
      await setCachedSites([...sites, site], userId);
      return site;
    } catch {
      return null;
    }
  }, [token, userId, sites]);

  const select = useCallback((siteId: string | null) => update({ activeSiteId: siteId }), [update]);

  return { sites, active, ready, canEdit: Boolean(token) && online, loading, refreshError, select, refresh, create };
}
