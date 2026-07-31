import { distance } from '../types/geometry';
import type { Point } from '../types/geometry';
import type { PuzzlePieceDefinition } from '../types/layout';
import { SNAP_THRESHOLD } from './constants';

export function getCorrectPosition(piece: PuzzlePieceDefinition): Point {
  return piece.correctPosition;
}

export function shouldSnap(piece: PuzzlePieceDefinition, currentPosition: Point): boolean {
  return distance(currentPosition, piece.correctPosition) <= SNAP_THRESHOLD;
}

export function resolveSnapPosition(
  piece: PuzzlePieceDefinition,
  currentPosition: Point,
): Point {
  return shouldSnap(piece, currentPosition) ? piece.correctPosition : currentPosition;
}
