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

export type TrayMetrics = {
  placement: PuzzleTrayPlacement;
  /** Tray rectangle in the shared board-and-tray coordinate space. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Scale pieces are drawn at while resting in the tray. */
  scale: number;
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

  if (placement === 'right') {
    const width = Math.max(
      MIN_TRAY_WIDTH,
      (boardWidth / (1 - TRAY_WIDTH_RATIO)) * TRAY_WIDTH_RATIO,
    );
    const height = boardHeight;
    const scale = Math.min(1, (width - TRAY_PADDING * 2) / largest.width);
    const slotExtent = largest.height * scale + TRAY_GAP;
    const columnHeight =
      slotExtent * layout.pieces.length + TRAY_PADDING * 2;
    const contentExtent = Math.max(columnHeight, height);
    const origin = columnHeight < height ? (height - columnHeight) / 2 : 0;

    return {
      placement,
      left: boardWidth,
      top: 0,
      width,
      height,
      scale,
      slotExtent,
      contentExtent,
      origin,
    };
  }

  const height = Math.max(
    MIN_TRAY_HEIGHT,
    (boardHeight / (1 - TRAY_HEIGHT_RATIO)) * TRAY_HEIGHT_RATIO,
  );
  const scale = Math.min(1, (height - TRAY_PADDING * 2) / largest.height);

  // Uniform slots sized to the widest piece: every piece then sits centred in
  // an identical cell, so the row is evenly spaced whatever order it is dealt
  // in. Sizing each slot to its own piece leaves ragged gaps instead.
  const slotExtent = largest.width * scale + TRAY_GAP;
  const rowWidth = slotExtent * layout.pieces.length + TRAY_PADDING * 2;
  const contentExtent = Math.max(rowWidth, boardWidth);
  const origin = rowWidth < boardWidth ? (boardWidth - rowWidth) / 2 : 0;

  return {
    placement,
    left: 0,
    top: boardHeight,
    width: boardWidth,
    height,
    scale,
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
  const slotStart = metrics.origin + TRAY_PADDING + slot * metrics.slotExtent;

  if (metrics.placement === 'right') {
    return {
      x:
        metrics.left +
        (metrics.width - piece.bounds.width) / 2,
      y:
        slotStart +
        (metrics.slotExtent - piece.bounds.height) / 2,
    };
  }

  // Tray scale is applied around the piece's own centre, so a shrunk piece is
  // drawn offset by half of what it lost. Centring on the *unscaled* bounds
  // cancels that exactly: the drawn piece lands centred in its slot. Using the
  // scaled bounds here pushes it down and right by half the shrinkage, which
  // drops tall pieces straight out of the bottom of the tray.
  return {
    x: slotStart + (metrics.slotExtent - piece.bounds.width) / 2,
    y: metrics.top + (metrics.height - piece.bounds.height) / 2,
  };
}
