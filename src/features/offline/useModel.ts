import { useCallback, useEffect, useState } from 'react';
import { config } from '../../config/env';
import type { ModelManifest } from '../inference/inference.types';
import { offlineOperation } from './offlineClient';
import { OFFLINE_OPERATIONS } from './offline.constants';

export type ModelState =
  /** The service worker is not in charge (development build): the model loads when listening starts. */
  | 'unmanaged'
  | 'checking'
  /** No verified model on the device yet; `available` tells its size before downloading. */
  | 'missing'
  | 'downloading'
  | 'ready'
  | 'error';

export interface ModelStatus {
  readonly state: ModelState;
  /** Model verified and installed on this device. */
  readonly installed: ModelManifest | null;
  /** Model currently published; differs from `installed` when an update exists. */
  readonly available: ModelManifest | null;
  readonly progress: { readonly received: number; readonly total: number };
  /** The browser refused persistent storage, so it may evict the model under pressure. */
  readonly evictable: boolean;
  readonly download: () => Promise<void>;
  readonly checkForUpdate: () => Promise<void>;
}

const managed = (): boolean => config.offlineEnabled && 'serviceWorker' in navigator;

/** Download, verification and update of the identification model, shared by Welcome, Listen and Settings. */
export function useModel(): ModelStatus {
  const [state, setState] = useState<ModelState>(() => managed() ? 'checking' : 'unmanaged');
  const [installed, setInstalled] = useState<ModelManifest | null>(null);
  const [available, setAvailable] = useState<ModelManifest | null>(null);
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [evictable, setEvictable] = useState(false);

  const checkForUpdate = useCallback(async (): Promise<void> => {
    if (!managed()) return;
    try {
      const current = await offlineOperation(OFFLINE_OPERATIONS.modelStatus);
      setInstalled(current);
      // The published manifest needs the network; without it the installed model is still fully usable.
      const published = await offlineOperation(OFFLINE_OPERATIONS.modelManifest).catch(() => null);
      setAvailable(published ?? current);
      setState(current ? 'ready' : published ? 'missing' : 'error');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!managed()) return;
    let active = true;
    // Deferred to a task so the initial check never sets state synchronously inside the effect.
    const timer = window.setTimeout(() => { if (active) void checkForUpdate(); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [checkForUpdate]);

  const download = useCallback(async (): Promise<void> => {
    if (!managed()) return;
    setState('downloading');
    setProgress({ received: 0, total: available?.size_bytes ?? 0 });
    try {
      // Ask before the large download, so the browser can keep the model instead of evicting it.
      if ('persist' in navigator.storage) setEvictable(!await navigator.storage.persist());
      const verified = await offlineOperation(OFFLINE_OPERATIONS.downloadModel, {}, (received, total) => { setProgress({ received, total }); });
      setInstalled(verified);
      setAvailable(verified);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [available]);

  return { state, installed, available, progress, evictable, download, checkForUpdate };
}
