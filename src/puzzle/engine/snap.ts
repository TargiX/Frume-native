import { distance } from '../types/geometry';
import type { Point } from '../types/geometry';
import type { PuzzlePieceDefinition } from '../types/layout';
import {
  MAX_SNAP_THRESHOLD,
  MIN_SNAP_THRESHOLD,
  SNAP_THRESHOLD_RATIO,
} from './constants';

export function getCorrectPosition(piece: PuzzlePieceDefinition): Point {
  return piece.correctPosition;
}

/** Snap distance for one piece, derived from its own bounds. */
export function snapThreshold(piece: PuzzlePieceDefinition): number {
  const extent = Math.min(piece.bounds.width, piece.bounds.height);
  return Math.min(
    MAX_SNAP_THRESHOLD,
    Math.max(MIN_SNAP_THRESHOLD, extent * SNAP_THRESHOLD_RATIO),
  );
}

export function shouldSnap(piece: PuzzlePieceDefinition, currentPosition: Point): boolean {
  return distance(currentPosition, piece.correctPosition) <= snapThreshold(piece);
}

export function resolveSnapPosition(
  piece: PuzzlePieceDefinition,
  currentPosition: Point,
): Point {
  return shouldSnap(piece, currentPosition) ? piece.correctPosition : currentPosition;
}
