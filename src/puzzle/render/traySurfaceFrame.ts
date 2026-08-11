type TrayFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Extends the visual conveyor through the piece-overflow zone while leaving
 * the engine's logical tray viewport unchanged.
 */
export function resolveTraySurfaceFrame(
  tray: TrayFrame,
  placement: 'bottom' | 'right',
  surfaceInset: number,
  /** Where the board's origin sits in the drawn workspace. */
  originX: number = surfaceInset,
  originY: number = surfaceInset,
): TrayFrame {
  if (placement === 'bottom') {
    return {
      // The shelf keeps its own run and gains the overflow margin at each end,
      // so it reaches the edges of the table rather than the board's corner.
      left: tray.left + originX - surfaceInset,
      top: tray.top + originY,
      width: tray.width + surfaceInset * 2,
      height: tray.height + surfaceInset,
    };
  }

  return {
    left: tray.left + originX,
    top: tray.top + originY - surfaceInset,
    width: tray.width + surfaceInset,
    height: tray.height + surfaceInset * 2,
  };
}
