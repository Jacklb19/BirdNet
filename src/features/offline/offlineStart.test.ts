// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_OPERATIONS, SERVICE_WORKER_READY_TIMEOUT_MS } from './offline.constants';

vi.mock('../../config/env', () => ({ config: { offlineEnabled: true } }));
vi.mock('./appUpdate', () => ({ watchForUpdates: vi.fn() }));

/** Regression of audit F01: a failed registration left every operation waiting for ever. */
describe('offline worker start', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('fails at once when the registration fails, and registers again on the next try', async () => {
    const register = vi.fn().mockRejectedValueOnce(new Error('503')).mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal('navigator', { serviceWorker: { register, ready: new Promise(() => undefined) } });
    const { offlineOperation } = await import('./offlineClient');
    await expect(offlineOperation(OFFLINE_OPERATIONS.modelStatus)).rejects.toThrow('503');
    void offlineOperation(OFFLINE_OPERATIONS.modelStatus).catch(() => undefined);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('gives up waiting for a worker that never becomes active', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn().mockResolvedValue({}), ready: new Promise(() => undefined) } });
    const { offlineOperation } = await import('./offlineClient');
    const operation = offlineOperation(OFFLINE_OPERATIONS.modelStatus);
    const outcome = expect(operation).rejects.toThrow('did not start');
    await vi.advanceTimersByTimeAsync(SERVICE_WORKER_READY_TIMEOUT_MS);
    await outcome;
  });
});
