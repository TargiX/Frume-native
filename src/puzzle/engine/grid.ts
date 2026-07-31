import type { PuzzleLayout, PuzzlePieceDefinition } from '../types';

export function getGridDimensions(
  pieces: readonly PuzzlePieceDefinition[],
): { rows: number; columns: number } {
  const rows = Math.max(...pieces.map((piece) => piece.row)) + 1;
  const columns = Math.max(...pieces.map((piece) => piece.col)) + 1;
  return { rows, columns };
}

export function getGridDimensionsFromLayout(layout: PuzzleLayout): { rows: number; columns: number } {
  return getGridDimensions(layout.pieces);
}
