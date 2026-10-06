import { useEffect, useState } from 'react';
import { formatBytes, formatNumber, formatPercent, useI18n } from '../../i18n';
import type { ModelManifest } from '../inference/inference.types';
import { offlineOperation, scheduleSynchronization } from './offlineClient';
import { DEFAULT_QUEUE_BYTES, type ModelDownloadState, type OfflineSettings, type QueueStats } from './types';

/** Real cache and queue states complement the existing recorder without adding navigation. */
export function OfflinePanel(): React.JSX.Element {
  const { dict, locale } = useI18n();
  const text = dict.offline;
  const [model, setModel] = useState<ModelDownloadState>({ status: 'missing', received: 0, total: 0 });
  const [settings, setSettings] = useState<OfflineSettings | null>(null);
  const [stats, setStats] = useState<QueueStats>({ count: 0, bytes: 0, waitingLocation: 0, waitingAccount: 0 });
  const [error, setError] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let mounted = true;
    const isMounted = (): boolean => mounted;
    const refresh = async (): Promise<void> => {
      const result = await offlineOperation<QueueStats>('QUEUE_STATS');
      if (mounted) setStats(result);
    };
    void (async () => {
      const preferences = await offlineOperation<OfflineSettings>('GET_SETTINGS');
      const cached = await offlineOperation<ModelManifest | null>('MODEL_STATUS');
      const available = cached ?? await offlineOperation<ModelManifest>('MODEL_MANIFEST');
      if (!isMounted()) return;
      setSettings(preferences);
      if (cached) setModel({ status: 'cached', received: cached.size_bytes, total: cached.size_bytes, manifest: cached });
      else setModel({ status: 'missing', received: 0, total: available.size_bytes });
      await refresh();
    })().catch(() => { if (mounted) setError(true); });
    const interval = setInterval(() => { void refresh().catch(() => { if (mounted) setError(true); }); }, 5000);
    const changed = (): void => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void scheduleSynchronization().then(refresh).catch(() => { if (mounted) setError(true); });
    };
    const failed = (): void => { setError(true); };
    window.addEventListener('online', changed); window.addEventListener('offline', changed); window.addEventListener('birdnet-sync-error', failed);
    return () => { mounted = false; clearInterval(interval); window.removeEventListener('online', changed); window.removeEventListener('offline', changed); window.removeEventListener('birdnet-sync-error', failed); };
  }, []);
  const changeSettings = async (changes: Partial<Omit<OfflineSettings, 'session'>>): Promise<void> => {
    try {
      setError(false);
      await offlineOperation('UPDATE_SETTINGS', { changes });
      setSettings(await offlineOperation<OfflineSettings>('GET_SETTINGS'));
    } catch { setError(true); }
  };
  const download = async (): Promise<void> => {
    setError(false);
    setModel((previous) => ({ ...previous, status: 'downloading', received: 0 }));
    try {
      if ('persist' in navigator.storage) setPersistent(await navigator.storage.persist());
      const cached = await offlineOperation<ModelManifest>('DOWNLOAD_MODEL', { manifestUrl: '/api/v1/model/latest' }, (received, total) => {
        setModel((previous) => ({ ...previous, status: 'downloading', received, total }));
      });
      setModel({ status: 'cached', received: cached.size_bytes, total: cached.size_bytes, manifest: cached });
    } catch { setModel((previous) => ({ ...previous, status: 'error' })); setError(true); }
  };
  return <section className="offline-panel" aria-label={text.title}>
    <div className="section-heading"><h2>{text.title}</h2><span>{online ? text.online : text.offline}</span></div>
    {!import.meta.env.PROD ? <p>{text.productionOnly}</p> : <>
      <p role="status">{model.status === 'cached' ? dict.modelDownload.cachedStatus : model.status === 'downloading' ? dict.modelDownload.downloading : dict.modelDownload.missingWarning}</p>
      {model.total > 0 && <p>{dict.modelDownload.sizeLabel} {formatBytes(model.total, locale)} · {formatNumber(model.total, locale)} B</p>}
      <button type="button" className="offline-action" disabled={model.status === 'downloading' || !settings} onClick={() => { void download(); }}>{model.status === 'cached' ? text.updateModel : dict.modelDownload.buttonDownload}</button>
      {model.status === 'downloading' && <><progress aria-label={dict.modelDownload.downloading} value={model.received} max={model.total || 1} /><p>{formatBytes(model.received, locale)} / {formatBytes(model.total, locale)} · {formatPercent(model.total ? model.received / model.total : 0, locale, 0)}</p></>}
      <p>{dict.modelDownload.wifiRecommendation}</p>
      {persistent === false && <p>{text.persistenceUnavailable}</p>}
      <p>{text.pending}: <strong>{formatNumber(stats.count, locale)}</strong> · {formatBytes(stats.bytes, locale)} / {formatBytes(settings?.maxBytes ?? DEFAULT_QUEUE_BYTES, locale)}</p>
      <progress aria-label={text.storageUsage} value={stats.bytes} max={settings?.maxBytes ?? DEFAULT_QUEUE_BYTES} />
      <p>{text.accountPending} {text.locationPending}: {formatNumber(stats.waitingLocation, locale)}.</p>
      {settings && <fieldset className="offline-preferences"><legend>{text.permissions}</legend>
        <label><input type="checkbox" checked={settings.audioConsent} onChange={(event) => { void changeSettings({ audioConsent: event.target.checked }); }} />{text.audioConsent}</label>
        <p>{text.audioExplanation}</p>
        <label><input type="checkbox" checked={settings.locationEnabled} onChange={(event) => { void changeSettings({ locationEnabled: event.target.checked }); }} />{text.locationConsent}</label>
        <p>{text.locationExplanation}</p>
        <label>{text.storageLimit}<input type="number" min="1" step="1" defaultValue={settings.maxBytes / (1024 * 1024)} onBlur={(event) => { const amount = event.target.valueAsNumber; if (Number.isSafeInteger(amount) && amount >= 1) void changeSettings({ maxBytes: amount * 1024 * 1024 }); else setError(true); }} /></label>
        <p>{text.capacityExplanation}</p>
      </fieldset>}
    </>}
    {error && <p role="alert" className="error-notice">{text.error}</p>}
  </section>;
}
