import type { IconName } from '../../shared/ui/Icon';

/**
 * The walk drawn on the home page: birds common in Bogotá's gardens, parks and wetlands, pinned along a path in the
 * order they would be heard. Positions are percentages of the scene (x from the left, y from the top) and follow the
 * path of WALK_PATH below.
 */
export const HOME_WALK = Object.freeze([
  { species: 'Zonotrichia capensis', x: 20, y: 78 },
  { species: 'Colibri coruscans', x: 35, y: 58 },
  { species: 'Pyrocephalus rubinus', x: 53, y: 38 },
  { species: 'Thraupis episcopus', x: 71, y: 26 },
  { species: 'Turdus fuscater', x: 84, y: 18 },
] as const);

/** Path of the walk in the scene's 100 × 100 box; it passes under every pin of HOME_WALK. */
export const WALK_PATH = 'M8 92 C14 84 17 80 20 78 S30 66 35 58 S46 44 53 38 S64 30 71 26 S80 20 84 18';

/** How long each bird of the walk stays as "singing now" on the scene's plate. */
export const HOME_WALK_STEP_MS = 2600;

/** The album page of the home: the first birds are pasted in, the last ones are still to find. */
export const HOME_ALBUM = Object.freeze({
  found: ['Turdus fuscater', 'Zonotrichia capensis', 'Colibri coruscans', 'Thraupis episcopus'],
  missing: ['Pyrocephalus rubinus', 'Diglossa humeralis'],
} as const);

/** Bird of the sample guide card on the album's right page. */
export const HOME_CARD_SPECIES = 'Colibri coruscans';

/** Sections of the home page, in page order; the bar links to them and their texts are keyed by `id`. */
export const HOME_SECTIONS = Object.freeze(['guide', 'how', 'map', 'privacy'] as const);
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** How the app works, in the order it happens; texts are keyed by the step. */
export const HOME_STEPS = Object.freeze([
  { id: 'listen', icon: 'listen' },
  { id: 'identify', icon: 'bird' },
  { id: 'collect', icon: 'album' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomeStep = (typeof HOME_STEPS)[number]['id'];

/** What a guide card holds; texts are keyed by `id`. */
export const HOME_CARD_PARTS = Object.freeze([
  { id: 'about', icon: 'book' },
  { id: 'range', icon: 'map' },
  { id: 'when', icon: 'clock' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomeCardPart = (typeof HOME_CARD_PARTS)[number]['id'];

/** What the map section explains, in the order it happens on a walk; texts are keyed by `id`. */
export const HOME_MAP_POINTS = Object.freeze([
  { id: 'pins', icon: 'sites' },
  { id: 'territories', icon: 'layers' },
  { id: 'sharing', icon: 'privacy' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomeMapPoint = (typeof HOME_MAP_POINTS)[number]['id'];

/** Circumradius of a hexagon of the territory scene, in the scene's 100 × 100 box. */
export const HOME_TERRITORY_HEX = 11.5;

/**
 * The territory scene: hexagons in axial coordinates around the centre. The walked ones carry the bird heard most
 * in them (and some show its sticker); the others are still blank.
 */
export const HOME_TERRITORIES: readonly { readonly q: number; readonly r: number; readonly species: string | null; readonly pinned?: boolean }[] = Object.freeze([
  { q: 1, r: -2, species: null },
  { q: 2, r: -2, species: 'Thraupis episcopus', pinned: true },
  { q: 0, r: -1, species: null },
  { q: 1, r: -1, species: 'Pyrocephalus rubinus', pinned: true },
  { q: 2, r: -1, species: 'Thraupis episcopus' },
  { q: -1, r: 0, species: 'Colibri coruscans', pinned: true },
  { q: 0, r: 0, species: 'Pyrocephalus rubinus' },
  { q: 1, r: 0, species: null },
  { q: -2, r: 1, species: 'Turdus fuscater', pinned: true },
  { q: -1, r: 1, species: 'Colibri coruscans' },
  { q: 0, r: 1, species: null },
  { q: -2, r: 2, species: 'Turdus fuscater' },
  { q: -1, r: 2, species: null },
]);

/** The walk across the territory scene: through the centres of the walked hexagons, from the lower left. */
export const HOME_TERRITORY_PATH = 'M10 92 L20.1 84.5 L20.1 67.3 L40 67.3 L30.1 50 L50 50 L60 32.8 L79.9 32.8 L69.9 15.5';

/** Privacy promises, each kept by a decision of the project (ADR-01, ADR-22, RNF-08, ADR-03). */
export const HOME_PROMISES = Object.freeze([
  { id: 'audio', icon: 'privacy' },
  { id: 'location', icon: 'sites' },
  { id: 'account', icon: 'account' },
  { id: 'offline', icon: 'offline' },
] as const satisfies readonly { readonly id: string; readonly icon: IconName }[]);
export type HomePromise = (typeof HOME_PROMISES)[number]['id'];
