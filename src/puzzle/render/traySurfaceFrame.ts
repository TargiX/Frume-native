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
): TrayFrame {
  const workspaceWidth = tray.left + tray.width + surfaceInset * 2;
  const workspaceHeight = tray.top + tray.height + surfaceInset * 2;

  if (placement === 'bottom') {
    return {
      left: 0,
      top: tray.top + surfaceInset,
      width: workspaceWidth,
      height: tray.height + surfaceInset,
    };
  }

  return {
    left: tray.left + surfaceInset,
    top: 0,
    width: tray.width,
    height: workspaceHeight,
  };
}
