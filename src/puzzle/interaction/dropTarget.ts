/**
 * Tray scale is applied around each piece's centre. Runtime positions keep the
 * unscaled top-left, so the centre is the stable drop target before, during,
 * and after the lift animation.
 */
export function isPieceCenterOverTray(
  pieceTop: number,
  pieceHeight: number,
  trayTop: number,
): boolean {
  return (
    Number.isFinite(pieceTop) &&
    Number.isFinite(pieceHeight) &&
    pieceHeight > 0 &&
    pieceTop + pieceHeight / 2 >= trayTop
  );
}
