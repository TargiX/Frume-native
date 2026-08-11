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
