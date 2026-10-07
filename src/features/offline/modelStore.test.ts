// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelManifest } from '../inference/inference.types';
import type { OfflineProgressCallback } from './offlineClient';
import { OFFLINE_OPERATIONS, type OfflineOperation } from './offline.constants';

const { operation } = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('./offlineClient', () => ({ offlineOperation: operation }));
// Only production builds hand the model to the service worker.
vi.mock('../../config/env', () => ({ config: { offlineEnabled: true } }));

const manifest = (sha256: string): ModelManifest => ({
  model_id: `birdnet-${sha256}`, variant: 'fp32', sample_rate: 48_000, window_samples: 144_000, window_seconds: 3, num_classes: 6522,
  sha256: sha256.repeat(64), size_bytes: 1000, labels_file: 'labels.txt', model_file: 'model.onnx', updated_at: '2026-10-01T00:00:00Z',
});
const installedModel = manifest('a');
const newerModel = manifest('b');

type Answer = (progress?: OfflineProgressCallback) => Promise<unknown>;

/** Answers each service worker operation; a missing one never settles, like a worker that has not replied yet. */
function serviceWorker(answers: Partial<Record<OfflineOperation, Answer>>): void {
  operation.mockImplementation((type: OfflineOperation, _request?: unknown, progress?: OfflineProgressCallback) =>
    answers[type]?.(progress) ?? new Promise(() => undefined));
}

/** A fresh page: the store is module state, so every test imports its own copy. */
async function loadStore(): Promise<typeof import('./modelStore')> {
  vi.resetModules();
  return import('./modelStore');
}

/** Lets pending promise callbacks run. */
const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  operation.mockReset();
  vi.stubGlobal('navigator', { serviceWorker: {}, storage: { persist: () => Promise.resolve(true) } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('shared model state', () => {
  it('checks once for every screen and shares one download with its progress', async () => {
    let finish: (value: ModelManifest) => void = () => undefined;
    let report: OfflineProgressCallback = () => undefined;
    serviceWorker({
      [OFFLINE_OPERATIONS.modelStatus]: () => Promise.resolve(null),
      [OFFLINE_OPERATIONS.modelManifest]: () => Promise.resolve(installedModel),
      [OFFLINE_OPERATIONS.downloadModel]: (progress) => new Promise((resolve) => { report = progress ?? report; finish = resolve; }),
    });
    const store = await loadStore();
    // Welcome, Listen and Settings each subscribe; the initial check runs once.
    for (let screen = 0; screen < 3; screen++) store.subscribeModel(() => undefined);
    await settled();
    expect(operation.mock.calls.filter(([type]) => type === OFFLINE_OPERATIONS.modelStatus)).toHaveLength(1);
    expect(store.modelSnapshot().state).toBe('missing');

    const first = store.downloadModel();
    const second = store.downloadModel();
    await settled();
    expect(operation.mock.calls.filter(([type]) => type === OFFLINE_OPERATIONS.downloadModel)).toHaveLength(1);
    report(400, 1000);
    expect(store.modelSnapshot()).toMatchObject({ state: 'downloading', progress: { received: 400, total: 1000 } });

    finish(installedModel);
    await Promise.all([first, second]);
    expect(store.modelSnapshot()).toMatchObject({ state: 'ready', installed: installedModel });
  });

  it('tells "no newer version" from "could not check"', async () => {
    let published: () => Promise<ModelManifest> = () => Promise.reject(new Error('offline'));
    serviceWorker({
      [OFFLINE_OPERATIONS.modelStatus]: () => Promise.resolve(installedModel),
      [OFFLINE_OPERATIONS.modelManifest]: () => published(),
    });
    const store = await loadStore();
    store.subscribeModel(() => undefined);
    await settled();
    // The check made on start says nothing until the person asks.
    expect(store.modelSnapshot()).toMatchObject({ state: 'ready', updateCheck: 'idle' });

    await store.checkModel();
    expect(store.modelSnapshot()).toMatchObject({ state: 'ready', updateCheck: 'failed', installed: installedModel });
    published = () => Promise.resolve(installedModel);
    await store.checkModel();
    expect(store.modelSnapshot().updateCheck).toBe('current');
    published = () => Promise.resolve(newerModel);
    await store.checkModel();
    expect(store.modelSnapshot()).toMatchObject({ updateCheck: 'available', available: newerModel });
  });

  it('keeps the installed model in use when an update download fails', async () => {
    serviceWorker({
      [OFFLINE_OPERATIONS.modelStatus]: () => Promise.resolve(installedModel),
      [OFFLINE_OPERATIONS.modelManifest]: () => Promise.resolve(newerModel),
      [OFFLINE_OPERATIONS.downloadModel]: () => Promise.reject(new Error('Model download already in progress.')),
    });
    const store = await loadStore();
    store.subscribeModel(() => undefined);
    await settled();
    await store.downloadModel();
    expect(store.modelSnapshot()).toMatchObject({ state: 'ready', installed: installedModel, updateFailed: true });
  });

  it('reports an error only when no model is usable', async () => {
    serviceWorker({
      [OFFLINE_OPERATIONS.modelStatus]: () => Promise.resolve(null),
      [OFFLINE_OPERATIONS.modelManifest]: () => Promise.resolve(installedModel),
      [OFFLINE_OPERATIONS.downloadModel]: () => Promise.reject(new Error('network')),
    });
    const store = await loadStore();
    store.subscribeModel(() => undefined);
    await settled();
    await store.downloadModel();
    expect(store.modelSnapshot()).toMatchObject({ state: 'error', installed: null, available: installedModel });
  });
});
