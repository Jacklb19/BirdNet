import { useEffect, useState } from 'react';
import { config } from '../../config/env';
import { offlineOperation } from '../offline/offlineClient';
import { OFFLINE_OPERATIONS } from '../offline/offline.constants';
import type { ApproximateLocation } from '../offline/types';
import { resolveManifestResource, STATIC_MANIFEST_URL, validateManifest } from './modelManifest';
import type { ModelManifest } from './inference.types';
import type { RegionRequest, RegionResponse, RegionSpecies } from './regionSpecies.types';

export type { RegionSpecies } from './regionSpecies.types';

/**
 * Resource URLs of the installed model: the verified copy the service worker serves when it manages the model,
 * otherwise (development) the packaged manifest. Null when no geographic model is installed.
 */
async function resources(): Promise<Pick<RegionRequest, 'geoModelUrl' | 'labelsUrl'> | null> {
  const origin = globalThis.location.origin;
  let manifest: ModelManifest | null;
  let base: string;
  if (config.offlineEnabled && 'serviceWorker' in navigator) {
    manifest = await offlineOperation(OFFLINE_OPERATIONS.modelStatus);
    base = origin;
  } else {
    const response = await fetch(STATIC_MANIFEST_URL);
    if (!response.ok) return null;
    manifest = validateManifest(await response.json());
    base = STATIC_MANIFEST_URL;
  }
  if (!manifest?.geo_model_file) return null;
  return {
    geoModelUrl: resolveManifestResource(manifest.geo_model_file, base, origin),
    labelsUrl: resolveManifestResource(manifest.labels_file, base, origin),
  };
}

/** Species likely at `location` in `week`, most likely first; null when the model is not installed. */
export async function regionSpecies(location: ApproximateLocation, week: number, limit: number): Promise<readonly RegionSpecies[] | null> {
  const files = await resources();
  if (!files) return null;
  const worker = new Worker(new URL('./geo.worker.ts', import.meta.url), { type: 'module' });
  try {
    const response = await new Promise<RegionResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<RegionResponse>) => { resolve(event.data); };
      worker.onerror = () => { reject(new Error('Geographic worker failed.')); };
      worker.postMessage({ ...files, location, week, limit } satisfies RegionRequest);
    });
    if (!response.ok) throw new Error('Geographic ranking failed.');
    return response.species;
  } finally { worker.terminate(); }
}

export type RegionState =
  | { readonly status: 'idle' | 'loading' | 'unavailable' }
  | { readonly status: 'ready'; readonly species: readonly RegionSpecies[] };

/** Region list for a place and week; `unavailable` when the model is not installed or could not run. */
export function useRegionSpecies(location: ApproximateLocation | null, week: number, limit: number): RegionState {
  const [state, setState] = useState<{ readonly key: string; readonly value: RegionState } | null>(null);
  // Plain values, so a new location object for the same place does not run the model again.
  const latitude = location?.latitude ?? null;
  const longitude = location?.longitude ?? null;
  const key = `${String(latitude)},${String(longitude)},${String(week)},${String(limit)}`;
  useEffect(() => {
    if (latitude === null || longitude === null) return;
    let active = true;
    regionSpecies({ latitude, longitude }, week, limit)
      .then((species) => { if (active) setState({ key, value: species ? { status: 'ready', species } : { status: 'unavailable' } }); })
      .catch(() => { if (active) setState({ key, value: { status: 'unavailable' } }); });
    return () => { active = false; };
  }, [latitude, longitude, week, limit, key]);
  if (latitude === null) return { status: 'idle' };
  return state?.key === key ? state.value : { status: 'loading' };
}
