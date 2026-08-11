import { describe, expect, it } from 'vitest';

import {
  BOARD_OVERSCROLL,
  clampOffset,
  clampScale,
  fitScale,
  initialCamera,
  MAX_BOARD_ZOOM,
  toBoardPoint,
  zoomAround,
  type BoardCameraBounds,
} from './boardCamera';

const SMALL: BoardCameraBounds = {
  contentWidth: 300,
  contentHeight: 400,
  viewportWidth: 400,
  viewportHeight: 600,
};

const LARGE: BoardCameraBounds = {
  contentWidth: 900,
  contentHeight: 1200,
  viewportWidth: 400,
  viewportHeight: 600,
};

describe('fitScale', () => {
  it('never magnifies a board that already fits', () => {
    expect(fitScale(SMALL)).toBe(1);
  });

  it('shrinks a larger board by its tightest axis', () => {
    // 400/900 is tighter than 600/1200.
    expect(fitScale(LARGE)).toBeCloseTo(400 / 900, 6);
  });

  it('survives a board with no size yet', () => {
    expect(
      fitScale({ ...SMALL, contentWidth: 0, contentHeight: 0 }),
    ).toBe(1);
  });
});

describe('clampScale', () => {
  it('refuses to zoom out past the whole board', () => {
    expect(clampScale(0.1, LARGE)).toBeCloseTo(fitScale(LARGE), 6);
  });

  it('stops at the deepest useful zoom', () => {
    expect(clampScale(99, LARGE)).toBe(MAX_BOARD_ZOOM);
  });

  it('falls back to fit when handed a broken number', () => {
    expect(clampScale(Number.NaN, LARGE)).toBeCloseTo(fitScale(LARGE), 6);
  });
});

describe('clampOffset', () => {
  it('centres an axis the board does not fill', () => {
    const camera = clampOffset({ scale: 1, x: -500, y: -500 }, SMALL);
    expect(camera.x).toBe((400 - 300) / 2);
    expect(camera.y).toBe((600 - 400) / 2);
  });

  it('keeps a larger board covering the viewport', () => {
    const camera = clampOffset({ scale: 1, x: 200, y: 300 }, LARGE);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);

    const pulled = clampOffset({ scale: 1, x: -5_000, y: -5_000 }, LARGE);
    expect(pulled.x).toBe(400 - 900);
    expect(pulled.y).toBe(600 - 1_200);
  });

  it('allows a bounded overscroll when one is asked for', () => {
    const camera = clampOffset(
      { scale: 1, x: 5_000, y: 5_000 },
      LARGE,
      BOARD_OVERSCROLL,
    );
    expect(camera.x).toBe(BOARD_OVERSCROLL);
    expect(camera.y).toBe(BOARD_OVERSCROLL);
  });
});

describe('zoomAround', () => {
  it('keeps the point under the finger in place', () => {
    const start = initialCamera(LARGE);
    const focus = { x: 120, y: 240 };
    const before = toBoardPoint(start, focus);

    const zoomed = zoomAround(start, focus, start.scale * 2, LARGE);
    const after = toBoardPoint(zoomed, focus);

    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('cannot be pinched below the whole board', () => {
    const start = initialCamera(LARGE);
    const zoomed = zoomAround(start, { x: 200, y: 300 }, 0.01, LARGE);
    expect(zoomed.scale).toBeCloseTo(fitScale(LARGE), 6);
  });

  it('leaves no gap at the edge after zooming out at a corner', () => {
    const start = initialCamera(LARGE);
    const deep = zoomAround(start, { x: 0, y: 0 }, MAX_BOARD_ZOOM, LARGE);
    const back = zoomAround(deep, { x: 400, y: 600 }, start.scale, LARGE);

    const scaledWidth = LARGE.contentWidth * back.scale;
    expect(back.x).toBeLessThanOrEqual(0.001);
    expect(back.x + scaledWidth).toBeGreaterThanOrEqual(
      LARGE.viewportWidth - 0.001,
    );
  });
});

describe('initialCamera', () => {
  it('opens on the whole board, centred', () => {
    const camera = initialCamera(LARGE);
    expect(camera.scale).toBeCloseTo(fitScale(LARGE), 6);
    // Tightest axis fills the viewport; the other is centred.
    expect(camera.x).toBeCloseTo(0, 6);
    expect(camera.y).toBeCloseTo(
      (600 - 1_200 * fitScale(LARGE)) / 2,
      6,
    );
  });
});
