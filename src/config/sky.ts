/**
 * Phases of the sky behind every page (ADR-20) and the local hour each one starts at, in day order. Near the
 * equator, where the app is deployed (Bogotá), sunrise and sunset move less than half an hour over the year, so
 * fixed hours are close enough for a background color and need no position or solar computation.
 */
export const SKY_PHASE_STARTS = Object.freeze([
  { phase: 'dawn', hour: 5 },
  { phase: 'day', hour: 8 },
  { phase: 'dusk', hour: 17 },
  { phase: 'night', hour: 19 },
] as const);

export type SkyPhase = (typeof SKY_PHASE_STARTS)[number]['phase'];

/** How often an open page checks whether the phase changed; the color fades over --duration-sky. */
export const SKY_REFRESH_MS = 5 * 60_000;
