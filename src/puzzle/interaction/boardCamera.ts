/**
 * Where the player is looking on a board larger than the screen.
 *
 * Below about 25 pieces the whole board fits and there is nothing to move; past
 * that a piece drawn to fit the screen is smaller than a fingertip, so the board
 * is drawn at a workable size and the player moves over it instead. This module
 * is the arithmetic of that view — deliberately free of gestures and shared
 * values so the rules can be tested without a renderer.
 *
 * All values are in surface points. `scale` multiplies the board; `x`/`y` are
 * the offset of the board's origin inside the viewport.
 */

export type BoardCamera = {
  scale: number;
  x: number;
  y: number;
};

export type BoardCameraBounds = {
  /** Board size at scale 1. */
  contentWidth: number;
  contentHeight: number;
  /** Visible area the board is moved inside. */
  viewportWidth: number;
  viewportHeight: number;
};

/**
 * Never smaller than fully visible, and never so deep that a piece fills the
 * screen. Three times fit-to-screen is enough to read a 400-piece cut.
 */
export const MAX_BOARD_ZOOM = 3;

/**
 * How far past the edge a drag may pull before it is pinned back. Matches the
 * feel of a scroll view: the board resists rather than stopping dead.
 */
export const BOARD_OVERSCROLL = 48;

/** The scale at which the whole board is visible, never magnifying past 1. */
export function fitScale(bounds: BoardCameraBounds): number {
  const { contentWidth, contentHeight, viewportWidth, viewportHeight } = bounds;
  if (contentWidth <= 0 || contentHeight <= 0) {
    return 1;
  }
  return Math.min(
    1,
    viewportWidth / contentWidth,
    viewportHeight / contentHeight,
  );
}

export function clampScale(scale: number, bounds: BoardCameraBounds): number {
  const minimum = fitScale(bounds);
  if (!Number.isFinite(scale)) {
    return minimum;
  }
  return Math.min(MAX_BOARD_ZOOM, Math.max(minimum, scale));
}

/**
 * Keeps the board covering the viewport, and centres it along any axis where it
 * is smaller — a board narrower than the screen should sit in the middle, not
 * cling to the left edge.
 */
export function clampOffset(
  camera: BoardCamera,
  bounds: BoardCameraBounds,
  overscroll = 0,
): BoardCamera {
  const scaledWidth = bounds.contentWidth * camera.scale;
  const scaledHeight = bounds.contentHeight * camera.scale;

  const clampAxis = (
    value: number,
    scaledExtent: number,
    viewportExtent: number,
  ): number => {
    if (scaledExtent <= viewportExtent) {
      return (viewportExtent - scaledExtent) / 2;
    }
    const minimum = viewportExtent - scaledExtent - overscroll;
    const maximum = overscroll;
    return Math.min(maximum, Math.max(minimum, value));
  };

  return {
    scale: camera.scale,
    x: clampAxis(camera.x, scaledWidth, bounds.viewportWidth),
    y: clampAxis(camera.y, scaledHeight, bounds.viewportHeight),
  };
}

/**
 * Zooms around a point the player is touching, so the content under the finger
 * stays under the finger — the same rule a pinch on a photograph follows.
 */
export function zoomAround(
  camera: BoardCamera,
  focus: { x: number; y: number },
  nextScale: number,
  bounds: BoardCameraBounds,
): BoardCamera {
  const scale = clampScale(nextScale, bounds);
  const ratio = scale / camera.scale;
  return clampOffset(
    {
      scale,
      x: focus.x - (focus.x - camera.x) * ratio,
      y: focus.y - (focus.y - camera.y) * ratio,
    },
    bounds,
  );
}

/** The view a puzzle opens at: the whole board, centred. */
export function initialCamera(bounds: BoardCameraBounds): BoardCamera {
  const scale = fitScale(bounds);
  return clampOffset({ scale, x: 0, y: 0 }, bounds);
}

/**
 * Converts a point on screen into board coordinates, which is what a drag needs
 * in order to put a piece where the finger actually is.
 */
export function toBoardPoint(
  camera: BoardCamera,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (point.x - camera.x) / camera.scale,
    y: (point.y - camera.y) / camera.scale,
  };
}
