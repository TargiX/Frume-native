import {
  MIN_TRAY_HEIGHT,
  MIN_TRAY_WIDTH,
  TRAY_HEIGHT_RATIO,
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
): PlayLayout {
  const maxSurfaceWidth = Math.max(windowWidth - TABLE_INSET * 2, 200);
  const maxSurfaceHeight = Math.max(windowHeight - TABLE_INSET * 2, 240);
  const safeAspect =
    Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 4 / 3;
  const trayPlacement: PuzzleTrayPlacement =
    windowWidth > windowHeight ? 'right' : 'bottom';

  if (trayPlacement === 'right') {
    const maxBoardWidth = Math.max(
      1,
      Math.min(
        maxSurfaceWidth * (1 - TRAY_WIDTH_RATIO),
        maxSurfaceWidth - MIN_TRAY_WIDTH,
      ),
    );
    const boardWidth = Math.min(maxBoardWidth, maxSurfaceHeight * safeAspect);
    const boardHeight = boardWidth / safeAspect;
    const trayWidth = Math.max(
      MIN_TRAY_WIDTH,
      (boardWidth / (1 - TRAY_WIDTH_RATIO)) * TRAY_WIDTH_RATIO,
    );

    return {
      surfaceWidth: boardWidth + trayWidth,
      surfaceHeight: boardHeight,
      boardWidth,
      boardHeight,
      trayPlacement,
    };
  }

  const maxBoardHeight = Math.max(
    1,
    Math.min(
      maxSurfaceHeight * (1 - TRAY_HEIGHT_RATIO),
      maxSurfaceHeight - MIN_TRAY_HEIGHT,
    ),
  );
  const boardWidth = Math.min(maxSurfaceWidth, maxBoardHeight * safeAspect);
  const boardHeight = boardWidth / safeAspect;
  const trayHeight = Math.max(
    MIN_TRAY_HEIGHT,
    (boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
  );

  return {
    surfaceWidth: boardWidth,
    surfaceHeight: boardHeight + trayHeight,
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
): PlayLayout {
  return computePlayLayout(
    windowWidth - insets.left - insets.right,
    windowHeight - insets.top - insets.bottom,
    imageAspect,
  );
}
