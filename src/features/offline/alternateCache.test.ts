// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { alternateBytes, STATIC_MANIFEST_URL } from '../inference/modelManifest';
import {
  activeAlternate, alternateFetchPending, downloadAlternate, installFetchedAlternate, prepareAlternateFetch, removeAlternate, type FetchedRecord,
} from './alternateCache';
import { activeModel, downloadModel, modelResource } from './modelCache';
import { ALTERNATE_MODEL_URL, ALTERNATE_PENDING_URL } from './offline.constants';
import productionManifest from '../../../public/models/manifest.json';

const origin = 'https://birdnet.example';
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const mainBytes = new Uint8Array([0, 1, 2, 3]);
const parts = [new Uint8Array([4, 5, 6]), new Uint8Array([7, 8])];
const whole = new Uint8Array([4, 5, 6, 7, 8]);
const geoBytes = new Uint8Array([9, 9]);
const LABELS = 'Turdus fuscater_Great Thrush\nZonotrichia capensis_Sparrow';
const alternate = {
  model_id: 'birdnet-plus', variant: 'birds', sample_rate: 32_000, window_samples: 96_000, window_seconds: 3,
  num_classes: 2, sha256: digest(whole), size_bytes: whole.length,
  model_files: ['plus.part1.onnx', 'plus.part2.onnx'], labels_file: 'plus-labels.txt',
  geo_model_file: 'plus-geo.onnx', geo_sha256: digest(geoBytes), geo_size_bytes: geoBytes.length,
};
const manifest = {
  ...productionManifest, num_classes: 2, size_bytes: mainBytes.length, sha256: digest(mainBytes),
  geo_model_file: undefined, geo_sha256: undefined, geo_size_bytes: undefined, alternate,
};
let stored: Map<string, Response>;
let published: unknown;

beforeEach(() => {
  stored = new Map();
  published = manifest;
  vi.stubGlobal('self', { location: { origin } });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('caches', { open: vi.fn(() => Promise.resolve({
    match: (key: string) => Promise.resolve(stored.get(new URL(key, origin).pathname)?.clone()),
    put: (key: string, response: Response) => { stored.set(new URL(key, origin).pathname, response.clone()); return Promise.resolve(); },
    keys: () => Promise.resolve([...stored.keys()].map((key) => new Request(new URL(key, origin)))),
    delete: (key: Request | string) => Promise.resolve(stored.delete(new URL(typeof key === 'string' ? key : key.url, origin).pathname)),
  })) });
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('plus.part1.onnx')) return Promise.resolve(new Response(parts[0]));
    if (url.endsWith('plus.part2.onnx')) return Promise.resolve(new Response(parts[1]));
    if (url.endsWith('plus-geo.onnx')) return Promise.resolve(new Response(geoBytes));
    if (url.endsWith('.onnx')) return Promise.resolve(new Response(mainBytes));
    if (url.endsWith('.txt')) return Promise.resolve(new Response(LABELS));
    return Promise.resolve(Response.json(published));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('installation of the second model', () => {
  it('joins the parts, verifies the whole and serves it as one file', async () => {
    const progress = vi.fn();
    expect(await activeAlternate()).toBeNull();
    const installed = await downloadAlternate(progress);
    expect(progress).toHaveBeenLastCalledWith(alternateBytes(alternate), alternateBytes(alternate));
    expect(installed.model_files).toEqual([modelResource(alternate.sha256, 'model')]);
    expect(new Uint8Array(await stored.get(modelResource(alternate.sha256, 'model'))?.clone().arrayBuffer() ?? new ArrayBuffer(0))).toEqual(whole);
    expect(await activeAlternate()).toEqual(installed);
  });

  it.each(['part', 'geo', 'labels'])('installs nothing when a file is not the published one: %s', async (failure) => {
    vi.mocked(fetch).mockImplementation((requested) => {
      const url = requested as string;
      if (failure === 'part' && url.endsWith('plus.part2.onnx')) return Promise.resolve(new Response(new Uint8Array([0, 0])));
      if (failure === 'geo' && url.endsWith('plus-geo.onnx')) return Promise.resolve(new Response(new Uint8Array([0, 0])));
      if (failure === 'labels' && url.endsWith('.txt')) return Promise.resolve(new Response('only one'));
      if (url.endsWith('plus.part1.onnx')) return Promise.resolve(new Response(parts[0]));
      if (url.endsWith('plus.part2.onnx')) return Promise.resolve(new Response(parts[1]));
      if (url.endsWith('plus-geo.onnx')) return Promise.resolve(new Response(geoBytes));
      if (url.endsWith('.txt')) return Promise.resolve(new Response(LABELS));
      return Promise.resolve(Response.json(published));
    });
    await expect(downloadAlternate(() => undefined)).rejects.toThrow();
    expect(stored.has(ALTERNATE_MODEL_URL)).toBe(false);
    expect(await activeAlternate()).toBeNull();
  });

  it('is refused where no second model is published', async () => {
    published = { ...manifest, alternate: undefined };
    await expect(downloadAlternate(() => undefined)).rejects.toThrow('No second model');
  });

  it('stops counting as installed once any of its bytes changed', async () => {
    await downloadAlternate(() => undefined);
    stored.set(modelResource(alternate.sha256, 'geo'), new Response(new Uint8Array([1, 1])));
    expect(await activeAlternate()).toBeNull();
  });

  it('survives a new download of the first model, and is removed whole when the person asks', async () => {
    const installed = await downloadAlternate(() => undefined);
    await downloadModel(STATIC_MANIFEST_URL, () => undefined);
    expect(await activeAlternate()).toEqual(installed);
    await removeAlternate();
    expect(await activeAlternate()).toBeNull();
    expect([...stored.keys()].some((key) => key.includes(alternate.sha256))).toBe(false);
    // The first model is untouched by the removal.
    expect(await activeModel()).not.toBeNull();
  });
});

describe('second model downloaded by the browser in the background', () => {
  /** The files as the browser hands them over, in the order they were asked for: the two parts, then the geo model. */
  const handedOver = (urls: readonly string[], bodies: readonly Uint8Array<ArrayBuffer>[] = [...parts, geoBytes]): FetchedRecord[] =>
    urls.map((url, index) => ({ request: { url }, responseReady: Promise.resolve(new Response(bodies[index])) }));

  it('asks the browser for exactly the bytes whose size is published, and installs them once verified', async () => {
    const plan = await prepareAlternateFetch();
    expect(plan.urls.map((url) => new URL(url).pathname.split('/').pop())).toEqual(['plus.part1.onnx', 'plus.part2.onnx', 'plus-geo.onnx']);
    expect(plan.total).toBe(alternateBytes(alternate));
    expect(await activeAlternate()).toBeNull();
    expect(await alternateFetchPending()).toBe(true);
    const installed = await installFetchedAlternate(handedOver(plan.urls));
    expect(await activeAlternate()).toEqual(installed);
    // An open page waits for this to know the files were dealt with.
    expect(await alternateFetchPending()).toBe(false);
  });

  it('checks the files against what was asked for, whatever is published by the time they arrive', async () => {
    const plan = await prepareAlternateFetch();
    published = { ...manifest, alternate: { ...alternate, sha256: digest(geoBytes) } };
    expect((await installFetchedAlternate(handedOver(plan.urls))).sha256).toBe(alternate.sha256);
  });

  it.each(['changed', 'missing'])('installs nothing when a file is %s, and the download has to be asked for again', async (failure) => {
    const plan = await prepareAlternateFetch();
    const records = failure === 'missing' ? handedOver(plan.urls).slice(1) : handedOver(plan.urls, [new Uint8Array([4, 5, 6]), new Uint8Array([0, 0]), geoBytes]);
    await expect(installFetchedAlternate(records)).rejects.toThrow();
    expect(await activeAlternate()).toBeNull();
    expect(await alternateFetchPending()).toBe(false);
    await expect(installFetchedAlternate(handedOver(plan.urls))).rejects.toThrow('No background download');
  });

  it('is not handed to the browser when the labels are not those of the model', async () => {
    vi.mocked(fetch).mockImplementation((requested) => Promise.resolve((requested as string).endsWith('.txt') ? new Response('only one') : Response.json(published)));
    await expect(prepareAlternateFetch()).rejects.toThrow('labels');
    expect(stored.has(ALTERNATE_PENDING_URL)).toBe(false);
  });
});
