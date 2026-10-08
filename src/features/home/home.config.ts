import type { IconName } from '../../shared/ui/Icon';

/**
 * Birds of the home page collage: common in Bogotá's gardens, parks and wetlands, so most visitors have already
 * heard them. Each one sits on the color block of its plate (src/features/species/plumage.ts).
 */
export const HOME_COLLAGE_SPECIES = Object.freeze([
  'Zonotrichia capensis',
  'Colibri coruscans',
  'Pyrocephalus rubinus',
  'Thraupis episcopus',
] as const);

/** How the app works, in the order it happens; texts are keyed by the step. */
export const HOME_STEPS = Object.freeze(['listen', 'identify', 'record'] as const);
export type HomeStep = (typeof HOME_STEPS)[number];

/** What a person can do with the app; texts are keyed by `id`. */
export const HOME_FEATURES = Object.freeze([
  { id: 'album', icon: 'album' },
  { id: 'guide', icon: 'book' },
  { id: 'map', icon: 'map' },
  { id: 'sites', icon: 'clock' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomeFeature = (typeof HOME_FEATURES)[number]['id'];

/** Privacy promises, each kept by a decision of the specification (ADR-01, ADR-04, RNF-08, ADR-03). */
export const HOME_PROMISES = Object.freeze([
  { id: 'audio', icon: 'privacy' },
  { id: 'location', icon: 'sites' },
  { id: 'account', icon: 'account' },
  { id: 'offline', icon: 'offline' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomePromise = (typeof HOME_PROMISES)[number]['id'];
