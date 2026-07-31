import type { PuzzleEngine } from '../engine';
import type { Point, SnapResult } from '../types';
import { isPieceCenterOverTray } from './dropTarget';

export type DragTrayTarget = {
  placement: 'bottom' | 'right';
  start: number;
  pieceWidth: number;
  pieceHeight: number;
};

export function beginPieceDrag(
  engine: PuzzleEngine,
  pieceId: string,
): void {
  engine.clearSnapFeedback();
  const piece = engine.getState().pieces[pieceId];
  if (!piece || piece.locked) {
    return;
  }
  // Keep `inTray` stable for the lifetime of the native recognizer. Flipping
  // it here replaces the Race gesture during the active drag, which turns the
  // first attempt into selection-only.
  engine.selectPiece(pieceId);
  engine.bringToFront(pieceId);
}

export function completePieceDrag(
  engine: PuzzleEngine,
  pieceId: string,
  position: Point,
  tray: DragTrayTarget,
): SnapResult | null {
  const piece = engine.getState().pieces[pieceId];
  if (!piece || piece.locked) {
    return null;
  }
  const axisPosition =
    tray.placement === 'bottom' ? position.y : position.x;
  const pieceExtent =
    tray.placement === 'bottom' ? tray.pieceHeight : tray.pieceWidth;
  if (isPieceCenterOverTray(axisPosition, pieceExtent, tray.start)) {
    engine.returnToTray(pieceId);
    return null;
  }
  if (piece.inTray) {
    engine.takeFromTray(pieceId, position);
  } else {
    engine.movePiece(pieceId, position);
  }
  return engine.releasePiece(pieceId);
}
