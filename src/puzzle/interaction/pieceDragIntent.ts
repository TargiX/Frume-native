/**
 * A loose piece already on the board must respond to tiny correction drags.
 * The tray keeps its wider axis-intent thresholds so scrolling remains stable.
 */
export const BOARD_PIECE_ACTIVATION_DISTANCE = 1;

export function hasBoardPieceDragIntent(
  translationX: number,
  translationY: number,
): boolean {
  return (
    Math.hypot(translationX, translationY) >=
    BOARD_PIECE_ACTIVATION_DISTANCE
  );
}
