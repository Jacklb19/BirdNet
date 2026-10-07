import { useCallback, useEffect, useState } from 'react';
import { dispatchSettingsChanged, SETTINGS_CHANGED_EVENT, type EditableSettings } from './offline.constants';
import { getSettings, updateSettings } from './queueStore';
import type { OfflineSettings } from './types';

export interface OfflineSettingsState {
  /** Null while loading, or when the browser has no IndexedDB (nothing can be stored on the device). */
  readonly settings: OfflineSettings | null;
  readonly error: boolean;
  /** Resolves false when the change was rejected (for example a capacity below what is already queued). */
  readonly update: (changes: EditableSettings) => Promise<boolean>;
}

/** Preferences stored with the local queue (permissions, capacity, active site), shared by every screen. */
export function useOfflineSettings(): OfflineSettingsState {
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    let active = true;
    const load = (): void => {
      getSettings().then((loaded) => { if (active) setSettings(loaded); }).catch(() => { if (active) setError(true); });
    };
    load();
    window.addEventListener(SETTINGS_CHANGED_EVENT, load);
    return () => { active = false; window.removeEventListener(SETTINGS_CHANGED_EVENT, load); };
  }, []);

  const update = useCallback(async (changes: EditableSettings): Promise<boolean> => {
    setError(false);
    try {
      await updateSettings(changes);
      dispatchSettingsChanged();
      return true;
    } catch {
      setError(true);
      return false;
    }
  }, []);

  return { settings, error, update };
}
