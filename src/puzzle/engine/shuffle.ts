import type { PieceRuntimeState } from '../types/engine';
import type { PuzzleLayout } from '../types/layout';
import { getTraySlotPosition } from './tray';

/** Resting tilt of a piece in the tray, so the row does not look stamped out. */
const TRAY_ROTATION = 1.6;

function shuffledOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }

  return order;
}

/**
 * Fills the tray.
 *
 * Every piece starts in a tray slot and the board starts empty, so the play
 * area is never cluttered and the player always knows where to reach for the
 * next piece. Slots are assigned once here and never recomputed.
 */
export function buildShuffledPieceStates(layout: PuzzleLayout): Record<string, PieceRuntimeState> {
  const states: Record<string, PieceRuntimeState> = {};
  const slots = shuffledOrder(layout.pieces.length);

  layout.pieces.forEach((piece, index) => {
    const slot = slots[index];

    states[piece.id] = {
      pieceId: piece.id,
      position: getTraySlotPosition(layout, slot, piece),
      rotation: slot % 2 === 0 ? TRAY_ROTATION : -TRAY_ROTATION,
      locked: false,
      zIndex: index + 1,
      inTray: true,
      traySlot: slot,
    };
  });

  return states;
}
