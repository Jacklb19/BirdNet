import { describe, expect, it } from 'vitest';
import { coveredEdges, NOTHING_COVERED, popupPlacement, visibleCentreOffset, visibleRect } from './mapViewport';

const map = { top: 0, right: 1280, bottom: 860, left: 0 };

describe('coveredEdges', () => {
  it('measures a side panel from its left edge to the right of the map, gutter included', () => {
    expect(coveredEdges(map, { top: 100, right: 1256, bottom: 640, left: 872 }, 'right')).toEqual({ top: 0, right: 408, bottom: 0 });
  });

  it('measures a bottom sheet from its top edge to the bottom of the map', () => {
    expect(coveredEdges({ top: 0, right: 360, bottom: 700, left: 0 }, { top: 406, right: 360, bottom: 700, left: 0 }, 'bottom'))
      .toEqual({ top: 0, right: 0, bottom: 294 });
  });

  it('never reports a negative strip when the panel lies outside the map', () => {
    expect(coveredEdges(map, { top: 900, right: 1400, bottom: 1000, left: 1300 }, 'right')).toEqual(NOTHING_COVERED);
  });

  it('also leaves room for wrapped filters above the map target on phones', () => {
    const covered = coveredEdges({ top: 64, right: 360, bottom: 834, left: 0 },
      { top: 480, right: 360, bottom: 834, left: 0 }, 'bottom', { top: 80, right: 344, bottom: 240, left: 16 });
    expect(covered).toEqual({ top: 176, right: 0, bottom: 354 });
    expect(visibleCentreOffset(360, 770, covered)).toEqual([0, -89]);
    expect(popupPlacement(360, 770, covered, 40)).toEqual({ offset: [0, -49], maxHeight: 120 });
  });
});

describe('visibleRect and visibleCentreOffset', () => {
  it('leaves the covered strip out and centres targets in what remains', () => {
    expect(visibleRect(1280, 860, { top: 0, right: 408, bottom: 0 })).toEqual({ top: 0, right: 872, bottom: 860 });
    expect(visibleCentreOffset(1280, 860, { top: 0, right: 408, bottom: 0 })).toEqual([-204, 0]);
    expect(visibleCentreOffset(360, 700, { top: 0, right: 0, bottom: 294 })).toEqual([0, -147]);
  });

  it('falls back to the whole map when the panel would leave nothing visible', () => {
    expect(visibleRect(360, 700, { top: 0, right: 0, bottom: 800 })).toEqual({ top: 0, right: 360, bottom: 700 });
    expect(visibleCentreOffset(360, 700, { top: 0, right: 0, bottom: 800 })).toEqual([0, 0]);
    expect(visibleRect(360, 700, { top: 300, right: 0, bottom: 500 })).toEqual({ top: 0, right: 360, bottom: 700 });
  });
});
