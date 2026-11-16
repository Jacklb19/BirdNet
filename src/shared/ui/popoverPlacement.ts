export interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface Placement {
  /** Opens under the field, or over it when there is clearly more room above (a field low on a phone screen). */
  readonly side: 'below' | 'above';
  /** Aligned with the field's end when starting at its left edge would leave the screen. */
  readonly align: 'start' | 'end';
  /** Height the popover may take on that side, in CSS pixels, so it never runs out of the visible area. */
  readonly maxHeight: number;
}

/**
 * Where a list or calendar opens from a field, inside the visible area (the visual viewport, which shrinks when a
 * phone keyboard is up). `preferred` is the height it would like; `width` the width it will take.
 */
export function placePopover(anchor: Box, viewport: { readonly width: number; readonly height: number }, preferred: number, width: number, gap: number): Placement {
  const below = viewport.height - anchor.bottom - gap * 2;
  const above = anchor.top - gap * 2;
  const side = below >= preferred || below >= above ? 'below' : 'above';
  const align = anchor.left + width > viewport.width - gap && anchor.right - width >= gap ? 'end' : 'start';
  return { side, align, maxHeight: Math.max(0, Math.min(preferred, side === 'below' ? below : above)) };
}
