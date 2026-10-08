/**
 * Geometry of the part of the map a person can actually see. The "In this area" panel floats over the map
 * (at the bottom on phones, on the right on wide screens), so what it covers is left out of the query and
 * of the centring, and the list never describes places hidden under it.
 */

/** Pixels hidden at the right and bottom edges of the map container. */
export interface CoveredEdges {
  readonly right: number;
  readonly bottom: number;
}

export const NOTHING_COVERED: CoveredEdges = Object.freeze({ right: 0, bottom: 0 });

/** Where the panel sits over the map: a side panel on wide screens, a bottom sheet on phones. */
export type PanelSide = 'right' | 'bottom';

interface Box {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Strip of the map covered by the panel, from both elements' boxes in viewport coordinates. */
export function coveredEdges(map: Box, panel: Box, side: PanelSide): CoveredEdges {
  return side === 'right'
    ? { right: Math.max(0, map.right - panel.left), bottom: 0 }
    : { right: 0, bottom: Math.max(0, map.bottom - panel.top) };
}

/** Screen corners (container pixels) of the uncovered rectangle; the whole map if the panel would leave nothing. */
export function visibleRect(width: number, height: number, covered: CoveredEdges): { readonly right: number; readonly bottom: number } {
  const right = width - covered.right;
  const bottom = height - covered.bottom;
  return right > 0 && bottom > 0 ? { right, bottom } : { right: width, bottom: height };
}

/** Camera offset (pixels) that puts a target in the middle of the uncovered rectangle instead of the container's. */
export function visibleCentreOffset(width: number, height: number, covered: CoveredEdges): [number, number] {
  const visible = visibleRect(width, height, covered);
  return [(visible.right - width) / 2, (visible.bottom - height) / 2];
}
