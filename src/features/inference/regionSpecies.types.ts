import type { ApproximateLocation } from '../offline/types';

/** Messages of the geographic worker (geo.worker.ts). */
export interface RegionRequest {
  readonly geoModelUrl: string;
  readonly labelsUrl: string;
  readonly location: ApproximateLocation;
  /** BirdNET week, or `YEAR_ROUND_WEEK`. */
  readonly week: number;
  readonly limit: number;
}

export interface RegionSpecies {
  readonly scientificName: string;
  /** English label of the model, used only when no localized name exists. */
  readonly commonName: string;
  readonly probability: number;
}

export type RegionResponse = { readonly ok: true; readonly species: readonly RegionSpecies[] } | { readonly ok: false };
