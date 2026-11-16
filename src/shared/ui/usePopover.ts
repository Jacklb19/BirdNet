import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { placePopover } from './popoverPlacement';

/** Room kept between the popover, its field and the screen edge, in CSS pixels. */
const POPOVER_GAP_PX = 8;

function remPx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function tokenPx(name: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.endsWith('rem') ? Number.parseFloat(value) * remPx() : Number.parseFloat(value) || 0;
}

export interface PopoverOptions {
  /**
   * `field`: at least as wide as the field. `end`: its own width, aligned with the field's end (a settings value).
   * `own`: its own width, from the field's start (a calendar).
   */
  readonly width?: 'field' | 'end' | 'own';
  /** Token of the height it would like; a calendar wants room for a whole month without scrolling. */
  readonly heightToken?: string;
  /** Token of the width it takes on its own. */
  readonly widthToken?: string;
}

/**
 * Fixed position of an open list or calendar, drawn in a layer of its own so no card or sheet that clips its
 * content can cut it (ADR-47). It is measured again while open: when the window or the visual viewport changes (a
 * phone keyboard opening) and when anything scrolls. A press outside both the field and the popover closes it.
 */
export function usePopover(
  open: boolean, field: RefObject<HTMLElement | null>, popover: RefObject<HTMLElement | null>, onClose: () => void,
  { width = 'field', heightToken = '--popover-max-height', widthToken = '--popover-max-width' }: PopoverOptions = {},
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const measure = (): void => {
      const anchor = field.current?.getBoundingClientRect();
      if (!anchor) return;
      const visual = window.visualViewport;
      const viewport = { width: window.innerWidth, height: visual ? visual.height + visual.offsetTop : window.innerHeight };
      const room = viewport.width - POPOVER_GAP_PX * 2;
      const own = Math.min(tokenPx(widthToken), room);
      const size = width === 'field' ? Math.min(Math.max(own, anchor.width), room) : own;
      const placement = placePopover(anchor, viewport, tokenPx(heightToken), size, POPOVER_GAP_PX);
      const startAt = width === 'end' || placement.align === 'end' ? anchor.right - size : anchor.left;
      const left = Math.min(Math.max(startAt, POPOVER_GAP_PX), viewport.width - size - POPOVER_GAP_PX);
      setStyle({
        left, width: size, maxHeight: placement.maxHeight,
        // Above the field it is anchored by its own bottom edge, whatever height its content ends up taking.
        ...(placement.side === 'below'
          ? { top: anchor.bottom + POPOVER_GAP_PX / 2 }
          : { top: anchor.top - POPOVER_GAP_PX / 2, transform: 'translateY(-100%)' }),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [open, field, width, heightToken, widthToken]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (field.current?.contains(event.target) || popover.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); };
  }, [open, field, popover, onClose]);

  return style;
}
