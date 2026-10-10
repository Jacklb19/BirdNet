/**
 * Settings of the walk mode (ADR-25): a listening session on the move, with the screen kept on, whose path and
 * songs are drawn on the person's own map.
 */

/** IndexedDB database and store of the walks; its own database, see `walkStore.ts`. */
export const WALKS_DATABASE = 'trino-walks-v1';
export const WALKS_STORE = 'walks';

/** Cells kept per walk. One cell is about ten metres, so this covers a walk of some twenty kilometres. */
export const WALK_TRACK_MAX_POINTS = 2000;

/** Walks kept on the phone; the oldest paths are dropped beyond it (their songs stay in the log). */
export const WALKS_KEPT_MAX = 60;

/**
 * Territories: the explored ground as hexagons, each tinted by the bird heard most in it. The value is the
 * hexagon's circumradius in metres of the Web Mercator plane (ground metres at the equator, slightly less away
 * from it): about a city block, so a walk uncovers a handful of them.
 */
export const TERRITORY_HEX_METERS = 60;

/** Zoom the map takes when it starts following a walk: single cells and the stickers along the path are legible. */
export const WALK_FOLLOW_ZOOM = 17;
