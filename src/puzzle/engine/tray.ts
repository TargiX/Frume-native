import type {
  PuzzleLayout,
  PuzzlePieceDefinition,
  PuzzleTrayPlacement,
} from '../types/layout';

/** Gap between neighbouring slots, at tray scale. */
const TRAY_GAP = 14;
/** Padding between the tray edges and the pieces inside it. */
const TRAY_PADDING = 12;
/** Share of the play surface given to the tray. */
export const TRAY_HEIGHT_RATIO = 0.15;
/** Keeps large Easy pieces comfortably tappable while they wait in the tray. */
export const MIN_TRAY_HEIGHT = 76;
/** Landscape counterpart to MIN_TRAY_HEIGHT. */
export const MIN_TRAY_WIDTH = 76;
/** Share of a landscape play surface given to the side tray. */
export const TRAY_WIDTH_RATIO = 0.15;
/**
 * Table left between the board and the tray shelf. Matches the inset the table
 * keeps around the surface (TABLE_INSET), so the tray is framed on every side
 * instead of butting straight up against the board.
 */
export const TRAY_BOARD_GAP = 16;

/**
 * How many rows the shelf is dealt into.
 *
 * One row is the shelf a small puzzle wants: every waiting piece is in reach
 * with a short flick. At a hundred pieces that same row becomes a corridor
 * several screens long, so the shelf gains depth instead of length — the same
 * move a real player makes when the box lid runs out of room.
 */
export function trayLanes(pieceCount: number): number {
  if (pieceCount > 120) {
    return 3;
  }
  if (pieceCount > 40) {
    return 2;
  }
  return 1;
}

/**
 * How much taller the shelf gets, which is not the same as how many rows it
 * holds. A third row must not take a third of the table: past two the shelf
 * keeps its height and the rows share it, so the pieces get smaller and the
 * player leans in with a pinch instead of losing the board.
 */
export const MAX_TRAY_DEPTH = 2;

export function trayDepth(pieceCount: number): number {
  return Math.min(trayLanes(pieceCount), MAX_TRAY_DEPTH);
}

export type TrayMetrics = {
  placement: PuzzleTrayPlacement;
  /** Tray rectangle in the shared board-and-tray coordinate space. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Scale pieces are drawn at while resting in the tray. */
  scale: number;
  /** Rows (bottom tray) or columns (side tray) the shelf is dealt into. */
  lanes: number;
  /** Extent of one slot along the tray's scrolling axis. */
  slotExtent: number;
  /** Full extent of the scrollable content along that axis. */
  contentExtent: number;
  /** Centres a short row/column instead of pinning it to the leading edge. */
  origin: number;
};

function largestBounds(pieces: readonly PuzzlePieceDefinition[]): {
  width: number;
  height: number;
} {
  return pieces.reduce(
    (largest, piece) => ({
      width: Math.max(largest.width, piece.bounds.width),
      height: Math.max(largest.height, piece.bounds.height),
    }),
    { width: 1, height: 1 },
  );
}

export function getTrayMetrics(layout: PuzzleLayout): TrayMetrics {
  const { width: boardWidth, height: boardHeight } = layout.boardSize;
  const placement = layout.trayPlacement ?? 'bottom';
  const largest = largestBounds(layout.pieces);
  // The shelf runs the width of the table, not the width of the board. It is
  // centred on the board, so it reaches equally into the table on both sides.
  const runExtent = Math.max(
    placement === 'right' ? boardHeight : boardWidth,
    layout.traySurfaceExtent ?? 0,
  );
  const runOrigin =
    (runExtent - (placement === 'right' ? boardHeight : boardWidth)) / -2;

  const lanes = trayLanes(layout.pieces.length);

  if (placement === 'right') {
    const width =
      Math.max(
        MIN_TRAY_WIDTH,
        (boardWidth / (1 - TRAY_WIDTH_RATIO)) * TRAY_WIDTH_RATIO,
      ) * trayDepth(layout.pieces.length);
    const laneWidth = width / lanes;
    const height = runExtent;
    const scale = Math.min(1, (laneWidth - TRAY_PADDING * 2) / largest.width);
    const slotExtent = largest.height * scale + TRAY_GAP;
    const slotsPerLane = Math.ceil(layout.pieces.length / lanes);
    const columnHeight = slotExtent * slotsPerLane + TRAY_PADDING * 2;
    const contentExtent = Math.max(columnHeight, height);
    const origin =
      runOrigin + (columnHeight < height ? (height - columnHeight) / 2 : 0);

    return {
      placement,
      left: boardWidth + TRAY_BOARD_GAP,
      top: runOrigin,
      width,
      height,
      scale,
      lanes,
      slotExtent,
      contentExtent,
      origin,
    };
  }

  const height =
    Math.max(
      MIN_TRAY_HEIGHT,
      (boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
    ) * trayDepth(layout.pieces.length);
  const laneHeight = height / lanes;
  const scale = Math.min(1, (laneHeight - TRAY_PADDING * 2) / largest.height);

  // Uniform slots sized to the widest piece: every piece then sits centred in
  // an identical cell, so the row is evenly spaced whatever order it is dealt
  // in. Sizing each slot to its own piece leaves ragged gaps instead.
  const slotExtent = largest.width * scale + TRAY_GAP;
  const slotsPerLane = Math.ceil(layout.pieces.length / lanes);
  const rowWidth = slotExtent * slotsPerLane + TRAY_PADDING * 2;
  const contentExtent = Math.max(rowWidth, runExtent);
  const origin =
    runOrigin + (rowWidth < runExtent ? (runExtent - rowWidth) / 2 : 0);

  return {
    placement,
    left: runOrigin,
    top: boardHeight + TRAY_BOARD_GAP,
    width: runExtent,
    height,
    scale,
    lanes,
    slotExtent,
    contentExtent,
    origin,
  };
}

/**
 * Position of a piece resting in a given tray slot.
 *
 * Slots are assigned once and never recomputed: when a piece is taken out the
 * others keep their slots, so nothing shifts under the player's finger and a
 * piece they were reaching for cannot move away.
 */
export function getTraySlotPosition(
  layout: PuzzleLayout,
  slot: number,
  piece: PuzzlePieceDefinition,
): { x: number; y: number } {
  const metrics = getTrayMetrics(layout);
  // Fill across the depth first, then move along: neighbouring pieces end up
  // stacked in the same column, so scrolling reveals whole columns rather than
  // sliding one row past three times.
  const lane = slot % metrics.lanes;
  const laneSlot = Math.floor(slot / metrics.lanes);
  const slotStart =
    metrics.origin + TRAY_PADDING + laneSlot * metrics.slotExtent;

  if (metrics.placement === 'right') {
    const laneWidth = metrics.width / metrics.lanes;
    return {
      x:
        metrics.left +
        lane * laneWidth +
        (laneWidth - piece.bounds.width) / 2,
      y:
        slotStart +
        (metrics.slotExtent - piece.bounds.height) / 2,
    };
  }

  const laneHeight = metrics.height / metrics.lanes;

  // Tray scale is applied around the piece's own centre, so a shrunk piece is
  // drawn offset by half of what it lost. Centring on the *unscaled* bounds
  // cancels that exactly: the drawn piece lands centred in its slot. Using the
  // scaled bounds here pushes it down and right by half the shrinkage, which
  // drops tall pieces straight out of the bottom of the tray.
  return {
    x: slotStart + (metrics.slotExtent - piece.bounds.width) / 2,
    y:
      metrics.top +
      lane * laneHeight +
      (laneHeight - piece.bounds.height) / 2,
  };
}
