import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n';
import { OfflinePanel } from './OfflinePanel';
import { offlineOperation, scheduleSynchronization } from './offlineClient';
import manifest from '../../../public/models/manifest.json';
import type { OfflineSettings } from './types';

vi.mock('./offlineClient');
let settings: OfflineSettings;
let cached: typeof manifest | null;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('PROD', true);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: {}, storage: { persist: vi.fn(() => Promise.resolve(false)) } });
  settings = { maxBytes: 64 * 1024 * 1024, audioConsent: false, locationEnabled: false, session: null };
  cached = null;
  vi.mocked(scheduleSynchronization).mockResolvedValue(undefined);
  vi.mocked(offlineOperation).mockImplementation((type, data = {}, progress) => {
    if (type === 'GET_SETTINGS') return Promise.resolve(settings);
    if (type === 'MODEL_STATUS') return Promise.resolve(cached);
    if (type === 'MODEL_MANIFEST') return Promise.resolve(manifest);
    if (type === 'QUEUE_STATS') return Promise.resolve({ count: 3, bytes: 1000, waitingLocation: 1, waitingAccount: 3 });
    if (type === 'UPDATE_SETTINGS' && 'changes' in data) {
      settings = { ...settings, ...data.changes as Partial<OfflineSettings> };
      return Promise.resolve(undefined);
    }
    progress?.(manifest.size_bytes, manifest.size_bytes);
    return Promise.resolve(manifest);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function show(): void { render(<I18nProvider><OfflinePanel /></I18nProvider>); }

describe('offline preparation controls', () => {
  it('shows size before downloading, real queue counts and independent permission controls', async () => {
    show();
    const audio = await screen.findByRole('checkbox', { name: 'Autorizar el envío de fragmentos dudosos para verificación' });
    expect(audio).not.toBeChecked();
    expect(screen.getByText(/Tamaño:/)).toBeInTheDocument();
    await userEvent.click(audio);
    await waitFor(() => { expect(audio).toBeChecked(); });
    const location = screen.getByRole('checkbox', { name: 'Registrar ubicación aproximada durante la escucha' });
    await userEvent.click(location);
    await waitFor(() => { expect(location).toBeChecked(); });
    const limit = screen.getByRole('spinbutton');
    fireEvent.blur(limit, { target: { value: '32' } });
    await waitFor(() => { expect(offlineOperation).toHaveBeenCalledWith('UPDATE_SETTINGS', { changes: { maxBytes: 32 * 1024 * 1024 } }); });
    expect(screen.getByRole('progressbar', { name: 'Espacio de la cola local' })).toHaveAttribute('value', '1000');
  });
  it('downloads explicitly and reports denied persistent storage honestly', async () => {
    show();
    const button = await screen.findByRole('button', { name: 'Descargar modelo para usar sin conexión' });
    await waitFor(() => { expect(button).toBeEnabled(); });
    await userEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Comprobar y descargar versión del modelo' })).toBeEnabled();
    expect(screen.getByText(/El navegador no garantizó almacenamiento persistente/)).toBeInTheDocument();
  });
  it('uses an existing verified model and handles foreground reconnection', async () => {
    cached = manifest;
    show();
    await screen.findByRole('button', { name: 'Comprobar y descargar versión del modelo' });
    fireEvent(window, new Event('online'));
    await waitFor(() => { expect(scheduleSynchronization).toHaveBeenCalled(); });
    fireEvent(window, new Event('birdnet-sync-error'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Los pendientes se conservan');
  });
  it('does not change permission state when storage rejects the preference', async () => {
    show();
    const audio = await screen.findByRole('checkbox', { name: 'Autorizar el envío de fragmentos dudosos para verificación' });
    const original = vi.mocked(offlineOperation).getMockImplementation();
    vi.mocked(offlineOperation).mockImplementation((type, ...arguments_) => type === 'UPDATE_SETTINGS' ? Promise.reject(new Error('Quota')) : original?.(type, ...arguments_) ?? Promise.resolve(undefined));
    await userEvent.click(audio);
    await screen.findByRole('alert');
    expect(audio).not.toBeChecked();
    fireEvent.blur(screen.getByRole('spinbutton'), { target: { value: '0' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('keeps a failed download visible without claiming offline readiness', async () => {
    show();
    const button = await screen.findByRole('button', { name: 'Descargar modelo para usar sin conexión' });
    await waitFor(() => { expect(button).toBeEnabled(); });
    vi.mocked(offlineOperation).mockRejectedValueOnce(new Error('Network'));
    await userEvent.click(button);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Comprobar y descargar versión del modelo' })).not.toBeInTheDocument();
  });
  it('explains development mode and unavailable initial storage', () => {
    vi.stubEnv('PROD', false);
    show();
    expect(screen.getByText(/La instalación y la descarga persistente/)).toBeInTheDocument();
    expect(offlineOperation).not.toHaveBeenCalled();
  });
});
