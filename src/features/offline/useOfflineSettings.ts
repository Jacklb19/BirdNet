import { useCallback, useEffect, useState } from 'react';
import type { EditableSettings } from './offline.constants';
import { getSettings, updateSettings } from './queueStore';
import type { OfflineSettings } from './types';
import { useQueueVersion } from './useQueueVersion';

export interface OfflineSettingsState {
  /** Null while loading, or when the browser has no IndexedDB (nothing can be stored on the device). */
  readonly settings: OfflineSettings | null;
  readonly error: boolean;
  /** Resolves false when the change was rejected (for example a capacity below what is already queued). */
  readonly update: (changes: EditableSettings) => Promise<boolean>;
}

/**
 * Preferences stored with the local queue (permissions, capacity, active site, sync session, cached sites), shared
 * by every screen. They are read again after every settings change, also one made in another tab or by the
 * service worker, so every open view shows the stored values.
 */
export function useOfflineSettings(): OfflineSettingsState {
  const version = useQueueVersion('settings');
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    getSettings().then((loaded) => { if (active) setSettings(loaded); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [version]);

  const update = useCallback(async (changes: EditableSettings): Promise<boolean> => {
    setError(false);
    try {
      // The queue store announces the committed change, which reloads every view of the settings.
      await updateSettings(changes);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }, []);

  return { settings, error, update };
}
