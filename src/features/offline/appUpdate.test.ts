// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS } from './offline.constants';

type Listener = () => void;

describe('bringing a new version of the app into use', () => {
  let containerListeners: Record<string, Listener>;
  let documentListeners: Record<string, Listener>;
  let container: { controller: object | null; addEventListener: (type: string, listener: Listener) => void };
  let registration: { update: ReturnType<typeof vi.fn> };
  const reload = vi.fn();
  // A fresh module per test: whether a version is ready is state of the page.
  const load = async (): Promise<typeof import('./appUpdate')> => { vi.resetModules(); return import('./appUpdate'); };
  const watch = (updates: typeof import('./appUpdate')): void => { updates.watchForUpdates(registration as unknown as ServiceWorkerRegistration); };

  beforeEach(() => {
    vi.useFakeTimers();
    reload.mockClear();
    containerListeners = {}; documentListeners = {};
    container = { controller: {}, addEventListener: (type, listener) => { containerListeners[type] = listener; } };
    registration = { update: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal('navigator', { serviceWorker: container });
    vi.stubGlobal('window', { location: { reload } });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (type: string, listener: Listener) => { documentListeners[type] = listener; } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('offers the new version once its worker has taken over, and never reloads under the person', async () => {
    const updates = await load();
    watch(updates);
    const announced = vi.fn();
    updates.subscribeUpdate(announced);
    expect(updates.updateReady()).toBe(false);
    containerListeners.controllerchange?.();
    expect(updates.updateReady()).toBe(true);
    expect(announced).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    updates.applyUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not take the first worker of a first visit for a new version, but notices the next one', async () => {
    container.controller = null;
    const updates = await load();
    watch(updates);
    containerListeners.controllerchange?.();
    expect(updates.updateReady()).toBe(false);
    containerListeners.controllerchange?.();
    expect(updates.updateReady()).toBe(true);
  });

  it('asks for a new version when the person comes back to an app left open, at most once an hour', async () => {
    const updates = await load();
    watch(updates);
    documentListeners.visibilitychange?.();
    expect(registration.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    documentListeners.visibilitychange?.();
    documentListeners.visibilitychange?.();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});
