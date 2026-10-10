import { useCallback, useState } from 'react';
import { API_ROUTES, apiFetch } from '../../config/api';
import { JSON_HEADERS } from '../offline/offline.constants';
import { useOfflineSettings } from '../offline/useOfflineSettings';
import { useOnline } from '../offline/useQueueStatus';
import { useAccountContext } from './accountContext';

/** Applies the choice to every song the account already uploaded, so one switch covers past and future. */
export async function applySharing(token: string, shared: boolean): Promise<void> {
  await apiFetch(API_ROUTES.meSharing, { token, method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ shared }) });
}

export interface SharingState {
  /** Undefined until the person has answered (or while the stored settings load): nothing is shared meanwhile. */
  readonly choice: boolean | undefined;
  /** The stored settings are loaded, so `choice` undefined really means "not answered yet". */
  readonly ready: boolean;
  readonly working: boolean;
  /** The choice was saved for new songs but could not be applied to the ones already uploaded. */
  readonly pendingUpload: boolean;
  readonly choose: (shared: boolean) => Promise<void>;
}

/**
 * Whether the person's songs go to everyone's map (ADR-22). The choice is stored with the local queue, where new
 * recordings read it, and sent to the API for what is already uploaded when there is a session and a connection.
 */
export function useSharing(): SharingState {
  const { settings, update } = useOfflineSettings();
  const { session } = useAccountContext();
  const online = useOnline();
  const [working, setWorking] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(false);
  const token = session?.access_token ?? null;

  const choose = useCallback(async (shared: boolean): Promise<void> => {
    setWorking(true);
    setPendingUpload(false);
    try {
      if (!await update({ shareMap: shared })) return;
      if (!token) return;
      if (!online) { setPendingUpload(true); return; }
      await applySharing(token, shared).catch(() => { setPendingUpload(true); });
    } finally { setWorking(false); }
  }, [update, token, online]);

  return { choice: settings?.shareMap, ready: settings !== null, working, pendingUpload, choose };
}
