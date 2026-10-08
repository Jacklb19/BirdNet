import type { IconName } from '../../shared/ui/Icon';

/**
 * Bird on the welcome hero: the rufous-collared sparrow (copetón) sings in gardens, parks and fields from
 * Mexico to Tierra del Fuego, Colombian cities included, so it is a bird most people have already heard.
 */
export const WELCOME_HERO_SPECIES = 'Zonotrichia capensis';

/** The three promises of the first run, in the order of the design; texts are keyed by `id` in the i18n. */
export const WELCOME_FEATURES = Object.freeze([
  { id: 'offline', icon: 'offline' },
  { id: 'privacy', icon: 'privacy' },
  { id: 'sites', icon: 'sites' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);

export type WelcomeFeature = (typeof WELCOME_FEATURES)[number]['id'];
