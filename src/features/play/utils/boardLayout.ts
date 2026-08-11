import {
  MIN_TRAY_HEIGHT,
  MIN_TRAY_WIDTH,
  TRAY_BOARD_GAP,
  TRAY_HEIGHT_RATIO,
  trayDepth,
  TRAY_WIDTH_RATIO,
} from '../../../puzzle/engine/tray';
import type { PuzzleTrayPlacement } from '../../../puzzle/types';

export const TABLE_INSET = 16;

export type PlayLayout = {
  /** Solve area. The tray sits below in portrait and to the right in landscape. */
  boardWidth: number;
  boardHeight: number;
  /** Board plus tray — the size of the interactive surface as a whole. */
  surfaceWidth: number;
  surfaceHeight: number;
  /**
   * How far the shelf runs across its scrolling axis. The board is sized by the
   * photograph and can leave table either side of it; the shelf is furniture
   * and uses the whole width of the table instead.
   */
  trayRunExtent: number;
  trayPlacement: PuzzleTrayPlacement;
};

export type PlayAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Fits one stable photograph aspect into the available area. Rotation may leave
 * more table visible, but it never changes which part of the photograph the
 * player is solving.
 */
export function computePlayLayout(
  windowWidth: number,
  windowHeight: number,
  imageAspect = 4 / 3,
  /**
   * Known before the cut exists, and needed here: a large puzzle is dealt into
   * a deeper shelf, and that depth has to come out of the board's share of the
   * screen rather than off the bottom of it.
   */
  pieceCount = 0,
): PlayLayout {
  const maxSurfaceWidth = Math.max(windowWidth - TABLE_INSET * 2, 200);
  const maxSurfaceHeight = Math.max(windowHeight - TABLE_INSET * 2, 240);
  const safeAspect =
    Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 4 / 3;
  const trayPlacement: PuzzleTrayPlacement =
    windowWidth > windowHeight ? 'right' : 'bottom';
  const depth = trayDepth(pieceCount);

  // The gap between board and tray is table, not play area: take it off the
  // top before splitting what is left, or the surface overflows the screen.
  if (trayPlacement === 'right') {
    const splittableWidth = Math.max(1, maxSurfaceWidth - TRAY_BOARD_GAP);
    const maxBoardWidth = Math.max(
      1,
      Math.min(
        splittableWidth / (1 + (TRAY_WIDTH_RATIO / (1 - TRAY_WIDTH_RATIO)) * depth),
        splittableWidth - MIN_TRAY_WIDTH * depth,
      ),
    );
    const boardWidth = Math.min(maxBoardWidth, maxSurfaceHeight * safeAspect);
    const boardHeight = boardWidth / safeAspect;
    const trayWidth =
      Math.max(
        MIN_TRAY_WIDTH,
        (boardWidth / (1 - TRAY_WIDTH_RATIO)) * TRAY_WIDTH_RATIO,
      ) * depth;

    return {
      surfaceWidth: boardWidth + TRAY_BOARD_GAP + trayWidth,
      surfaceHeight: boardHeight,
      trayRunExtent: maxSurfaceHeight,
      boardWidth,
      boardHeight,
      trayPlacement,
    };
  }

  const splittableHeight = Math.max(1, maxSurfaceHeight - TRAY_BOARD_GAP);
  const maxBoardHeight = Math.max(
    1,
    Math.min(
      splittableHeight /
        (1 + (TRAY_HEIGHT_RATIO / (1 - TRAY_HEIGHT_RATIO)) * depth),
      splittableHeight - MIN_TRAY_HEIGHT * depth,
    ),
  );
  const boardWidth = Math.min(maxSurfaceWidth, maxBoardHeight * safeAspect);
  const boardHeight = boardWidth / safeAspect;
  const trayHeight =
    Math.max(
      MIN_TRAY_HEIGHT,
      (boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
    ) * depth;

  return {
    surfaceWidth: boardWidth,
    surfaceHeight: boardHeight + TRAY_BOARD_GAP + trayHeight,
    trayRunExtent: maxSurfaceWidth,
    boardWidth,
    boardHeight,
    trayPlacement,
  };
}

/**
 * Resolves the Game screen's usable rectangle before fitting the board. Setup
 * uses this same function so a fresh cut is generated at its final size rather
 * than at the cutter's phone fallback and regenerated after navigation.
 */
export function computeSafeAreaPlayLayout(
  windowWidth: number,
  windowHeight: number,
  insets: PlayAreaInsets,
  imageAspect = 4 / 3,
  pieceCount = 0,
): PlayLayout {
  return computePlayLayout(
    windowWidth - insets.left - insets.right,
    windowHeight - insets.top - insets.bottom,
    imageAspect,
    pieceCount,
  );
}
