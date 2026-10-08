import { describe, expect, it } from 'vitest';
import { coveredEdges, NOTHING_COVERED, visibleCentreOffset, visibleRect } from './mapViewport';

const map = { top: 0, right: 1280, bottom: 860, left: 0 };

describe('coveredEdges', () => {
  it('measures a side panel from its left edge to the right of the map, gutter included', () => {
    expect(coveredEdges(map, { top: 100, right: 1256, bottom: 640, left: 872 }, 'right')).toEqual({ right: 408, bottom: 0 });
  });

  it('measures a bottom sheet from its top edge to the bottom of the map', () => {
    expect(coveredEdges({ top: 0, right: 360, bottom: 700, left: 0 }, { top: 406, right: 360, bottom: 700, left: 0 }, 'bottom'))
      .toEqual({ right: 0, bottom: 294 });
  });

  it('never reports a negative strip when the panel lies outside the map', () => {
    expect(coveredEdges(map, { top: 900, right: 1400, bottom: 1000, left: 1300 }, 'right')).toEqual(NOTHING_COVERED);
  });
});

describe('visibleRect and visibleCentreOffset', () => {
  it('leaves the covered strip out and centres targets in what remains', () => {
    expect(visibleRect(1280, 860, { right: 408, bottom: 0 })).toEqual({ right: 872, bottom: 860 });
    expect(visibleCentreOffset(1280, 860, { right: 408, bottom: 0 })).toEqual([-204, 0]);
    expect(visibleCentreOffset(360, 700, { right: 0, bottom: 294 })).toEqual([0, -147]);
  });

  it('falls back to the whole map when the panel would leave nothing visible', () => {
    expect(visibleRect(360, 700, { right: 0, bottom: 800 })).toEqual({ right: 360, bottom: 700 });
    expect(visibleCentreOffset(360, 700, { right: 0, bottom: 800 })).toEqual([0, 0]);
  });
});
