import { useCallback, useMemo, useState } from 'react';
import { useAccountContext } from '../account/accountContext';
import { dispatchSettingsChanged } from '../offline/offline.constants';
import { approximateLocation } from '../offline/queuePolicy';
import { setCachedSites } from '../offline/queueStore';
import type { CachedSite } from '../offline/types';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { createSite, listSites } from './sitesApi';

export interface SitesState {
  /** Sites as last fetched online; available offline so a site can be chosen in the field. */
  readonly sites: readonly CachedSite[];
  /** Site that new detections are attributed to, if any. */
  readonly active: CachedSite | null;
  /** Creating and refreshing sites needs an account and a connection; choosing one does not. */
  readonly canEdit: boolean;
  readonly loading: boolean;
  readonly error: boolean;
  readonly select: (siteId: string | null) => Promise<boolean>;
  readonly refresh: () => Promise<void>;
  readonly create: (name: string, location: { latitude: number; longitude: number }) => Promise<CachedSite | null>;
}

/** Monitoring sites of the signed-in person, with the device cache and the active-site choice. */
export function useSites(): SitesState {
  const { session } = useAccountContext();
  const online = useOnline();
  const { settings, update } = useOfflineSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const token = session?.access_token ?? null;
  const sites = useMemo(() => settings?.sites ?? [], [settings]);
  const active = useMemo(() => sites.find((site) => site.id === settings?.activeSiteId) ?? null, [sites, settings]);

  const store = useCallback(async (next: readonly CachedSite[]): Promise<void> => {
    await setCachedSites(next);
    dispatchSettingsChanged();
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token || !online) return;
    setLoading(true);
    setError(false);
    try {
      await store(await listSites(token));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, online, store]);

  const create = useCallback(async (name: string, location: { latitude: number; longitude: number }): Promise<CachedSite | null> => {
    if (!token) return null;
    setError(false);
    try {
      // Only the ~100 m cell ever leaves the device, as for detections.
      const site = await createSite(token, name.trim(), approximateLocation(location.latitude, location.longitude));
      await store([...sites, site]);
      return site;
    } catch {
      setError(true);
      return null;
    }
  }, [token, sites, store]);

  const select = useCallback((siteId: string | null) => update({ activeSiteId: siteId }), [update]);

  return { sites, active, canEdit: Boolean(token) && online, loading, error, select, refresh, create };
}
