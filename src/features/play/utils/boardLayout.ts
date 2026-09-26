import {
  MAX_TRAY_LANE_EXTENT,
  MIN_TRAY_HEIGHT,
  MIN_TRAY_WIDTH,
  TRAY_BOARD_GAP,
  TRAY_HEIGHT_RATIO,
  trayDepth,
  TRAY_WIDTH_RATIO,
  TWO_ROW_TRAY_MIN_PIECES,
} from '../../../puzzle/engine/tray';
import type { PuzzleTrayPlacement } from '../../../puzzle/types';

export const TABLE_INSET = 16;
/**
 * Height the floating HUD (progress pill and menu button) takes out of the top
 * of the play area, measured from the table inset, plus a little air.
 */
export const HUD_CLEARANCE = 44;

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
  /**
   * How deep the bottom shelf is. Absent in landscape, where the side shelf
   * keeps the width its board gives it.
   */
  trayHeight?: number;
  trayGap?: number;
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
    // The lane's natural share of the board, solved against the split, then
    // clamped: never narrower than a tappable lane, and never wider than a
    // piece needs — on a tablet the uncapped share would give the shelf a
    // quarter of the screen.
    const laneWidth = Math.min(
      MAX_TRAY_LANE_EXTENT,
      Math.max(
        MIN_TRAY_WIDTH,
        (splittableWidth * TRAY_WIDTH_RATIO) /
          (1 - TRAY_WIDTH_RATIO + TRAY_WIDTH_RATIO * depth),
      ),
    );
    const maxBoardWidth = Math.max(1, splittableWidth - laneWidth * depth);
    const boardWidth = Math.min(maxBoardWidth, maxSurfaceHeight * safeAspect);
    const boardHeight = boardWidth / safeAspect;
    // A height-limited board feeds a proportionally narrower shelf.
    const trayWidth =
      Math.min(
        MAX_TRAY_LANE_EXTENT,
        Math.max(
          MIN_TRAY_WIDTH,
          (boardWidth / (1 - TRAY_WIDTH_RATIO)) * TRAY_WIDTH_RATIO,
        ),
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
  const fittedTrayHeight =
    Math.min(
      MAX_TRAY_LANE_EXTENT,
      Math.max(
        MIN_TRAY_HEIGHT,
        (boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
      ),
    ) * depth;
  // A wide photo on a tall phone runs out of width first and leaves table
  // standing empty. When there is room for a whole second row, a puzzle past a
  // handful of pieces gets one: more of the pile in view, each piece a little
  // smaller than on the board. The board keeps exactly the size it had, and a
  // board limited by height has nothing left over and keeps its fitted shelf.
  const rowHeight = fittedTrayHeight / depth;
  const spareHeight = splittableHeight - boardHeight - fittedTrayHeight;
  const trayHeight =
    depth === 1 &&
    pieceCount >= TWO_ROW_TRAY_MIN_PIECES &&
    spareHeight >= rowHeight
      ? rowHeight * 2
      : fittedTrayHeight;

  // Whatever table is still left over goes between the board and the shelf,
  // so the shelf rests on the bottom edge of the screen rather than hanging
  // under the board. The board is centred in the space above the shelf once
  // it has cleared the HUD; a board with too little room to clear it keeps
  // the fixed gap and takes all of the room above itself instead.
  const leftover = Math.max(0, splittableHeight - boardHeight - trayHeight);
  const trayGap =
    TRAY_BOARD_GAP + Math.max(0, leftover - HUD_CLEARANCE) / 2;

  return {
    surfaceWidth: boardWidth,
    surfaceHeight: boardHeight + trayGap + trayHeight,
    trayRunExtent: maxSurfaceWidth,
    trayHeight,
    trayGap,
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
