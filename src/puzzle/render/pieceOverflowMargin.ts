import type { PuzzlePieceDefinition } from '../types';

const PIECE_SHADOW_ALLOWANCE = 8;

/**
 * Extra table area rendered around the logical board/tray surface.
 * One whole largest piece can cross an edge before the GPU canvas ends.
 */
export function getPieceOverflowMargin(
  pieces: readonly PuzzlePieceDefinition[],
): number {
  const largestExtent = pieces.reduce(
    (largest, piece) =>
      Math.max(largest, piece.bounds.width, piece.bounds.height),
    0,
  );

  return Math.ceil(largestExtent + PIECE_SHADOW_ALLOWANCE);
}

/**
 * Table drawn either side of the surface along one axis: the overflow margin,
 * or on a surface shorter than the screen, enough to fill it.
 *
 * The camera centres a workspace smaller than the viewport, but the shelf is
 * fixed furniture drawn from the workspace's own corner and does not follow.
 * On a wide photo in portrait the shelf slid up over the board's bottom rows.
 * Filling the viewport here leaves the camera nothing to centre, so board and
 * shelf share one origin again.
 */
export function resolveWorkspaceInset(
  surfaceExtent: number,
  overflowMargin: number,
  viewportExtent = 0,
): number {
  return Math.max(overflowMargin, (viewportExtent - surfaceExtent) / 2);
}
