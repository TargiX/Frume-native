type PieceRenderPositionInput = {
  locked: boolean;
  visualX: number;
  visualY: number;
  correctX: number;
  correctY: number;
  trayOffsetX: number;
  trayOffsetY: number;
};

/**
 * A seated piece must never inherit a stale presentation-spring coordinate.
 * Returning zero translation pins its original path exactly to the cut target.
 */
export function resolvePieceRenderTranslation({
  locked,
  visualX,
  visualY,
  correctX,
  correctY,
  trayOffsetX,
  trayOffsetY,
}: PieceRenderPositionInput): { x: number; y: number } {
  'worklet';
  if (locked) {
    return { x: 0, y: 0 };
  }
  return {
    x: visualX + trayOffsetX - correctX,
    y: visualY + trayOffsetY - correctY,
  };
}
