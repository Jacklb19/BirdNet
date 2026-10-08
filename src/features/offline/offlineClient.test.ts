// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageChannel, type MessagePort } from 'node:worker_threads';
import { OFFLINE_OPERATIONS } from './offline.constants';
import { offlineOperation, registerOffline, scheduleSynchronization } from './offlineClient';

let reply: (port: MessagePort) => void;
let registration: { active: { postMessage: ReturnType<typeof vi.fn> }; sync?: { register: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  vi.stubGlobal('MessageChannel', MessageChannel);
  reply = (port) => { port.postMessage({ progress: { received: 5, total: 10 } }); port.postMessage({ ok: true, result: 'ready' }); port.close(); };
  registration = { active: { postMessage: vi.fn((_message: unknown, ports: MessagePort[]) => { const port = ports[0]; if (port) reply(port); }) }, sync: { register: vi.fn(() => Promise.resolve()) } };
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration), controller: {} }, onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('offline worker communication', () => {
  it('delivers progress and a final result without treating progress as completion', async () => {
    const progress = vi.fn();
    await expect(offlineOperation(OFFLINE_OPERATIONS.downloadModel, {}, progress)).resolves.toBe('ready');
    expect(progress).toHaveBeenCalledWith(5, 10);
  });
  it('reports failed operations', async () => {
    reply = (port) => { port.postMessage({ ok: false }); port.close(); };
    await expect(offlineOperation(OFFLINE_OPERATIONS.queueStats)).rejects.toThrow();
  });
  it('does not pretend offline support exists without a service worker', async () => {
    vi.stubGlobal('navigator', {});
    await expect(offlineOperation(OFFLINE_OPERATIONS.queueStats)).rejects.toThrow();
    await scheduleSynchronization();
    vi.stubEnv('PROD', true);
    await registerOffline();
  });
  it('coalesces foreground synchronization and registers one background job', async () => {
    await Promise.all([scheduleSynchronization(), scheduleSynchronization(), scheduleSynchronization()]);
    expect(registration.sync?.register).toHaveBeenCalledTimes(1);
    expect(registration.active.postMessage).toHaveBeenCalledTimes(1);
  });
  it('falls back to foreground retry without Background Sync and remains queued offline', async () => {
    delete registration.sync;
    await scheduleSynchronization();
    expect(registration.active.postMessage).toHaveBeenCalledTimes(1);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration), controller: {} }, onLine: false });
    await scheduleSynchronization();
    expect(registration.active.postMessage).toHaveBeenCalledTimes(1);
  });
  it('keeps development free of production registration', async () => {
    vi.stubEnv('PROD', false);
    await registerOffline();
    expect(registration.active.postMessage).not.toHaveBeenCalled();
  });
});
