import { describe, expect, it } from 'vitest';
import { placePopover } from './popoverPlacement';

const viewport = { width: 360, height: 640 };
const field = (top: number, left = 16, right = 344): { top: number; bottom: number; left: number; right: number } => ({ top, bottom: top + 48, left, right });

describe('popover placement', () => {
  it('opens below with its preferred height when there is room', () => {
    expect(placePopover(field(100), viewport, 320, 300, 8)).toEqual({ side: 'below', align: 'start', maxHeight: 320 });
  });

  it('opens above a field low on the screen and keeps inside the visible area', () => {
    // A phone keyboard leaves 640 px; the field sits near the bottom.
    const placement = placePopover(field(520), viewport, 320, 300, 8);
    expect(placement.side).toBe('above');
    expect(placement.maxHeight).toBe(320);
  });

  it('shrinks instead of overflowing when neither side has the preferred height', () => {
    const small = { width: 360, height: 300 };
    // 116 px below the field and 104 above: the larger side, and only what fits there.
    expect(placePopover(field(120), small, 320, 300, 8)).toMatchObject({ side: 'below', maxHeight: 116 });
    expect(placePopover(field(140), small, 320, 300, 8)).toMatchObject({ side: 'above', maxHeight: 124 });
  });

  it('aligns to the field end when its start would push it off the screen', () => {
    expect(placePopover(field(100, 200, 344), viewport, 320, 300, 8).align).toBe('end');
    // Aligning a narrow field's end would push the popover off the left edge instead, so it keeps its start.
    expect(placePopover(field(100, 120, 200), viewport, 320, 300, 8).align).toBe('start');
  });
});
