import type {
  PieceRuntimeState,
  PuzzleTrayFilter,
} from '../types/engine';
import type { PuzzleCutterId, PuzzleLayout } from '../types/layout';
import { getTraySlotPosition } from './tray';

/** Resting tilt of a piece in the tray — the same value the deal assigns. */
const TRAY_ROTATION = 1.6;

/**
 * Edge pieces sit on the puzzle's outer boundary.
 *
 * Classic and Organic deal a complete row×column lattice, so the boundary is
 * the first and last row and column. The extents come from the pieces
 * themselves rather than a cut descriptor, so layouts saved before
 * descriptors existed still classify — and a baked cut whose seed labels no
 * longer form a full lattice degrades to "mostly edges" instead of hiding
 * the wrong pieces entirely.
 */
export function edgePieceIds(layout: PuzzleLayout): ReadonlySet<string> {
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;

  layout.pieces.forEach((piece) => {
    minRow = Math.min(minRow, piece.row);
    maxRow = Math.max(maxRow, piece.row);
    minCol = Math.min(minCol, piece.col);
    maxCol = Math.max(maxCol, piece.col);
  });

  const ids = new Set<string>();
  layout.pieces.forEach((piece) => {
    if (
      piece.row === minRow ||
      piece.row === maxRow ||
      piece.col === minCol ||
      piece.col === maxCol
    ) {
      ids.add(piece.id);
    }
  });
  return ids;
}

/**
 * Which cutters label their cells on a complete rectangular lattice. The
 * biomorphic family bakes irregular Voronoi cells whose row/col mark seed
 * positions, not lattice slots — an edge filter there would guess, so it is
 * not offered.
 */
export function supportsEdgeTrayFilter(cutterId: PuzzleCutterId): boolean {
  return cutterId === 'classic' || cutterId === 'organic';
}

/** True while a tray filter keeps this waiting piece out of view. */
export function isPieceHiddenByTrayFilter(
  piece: PieceRuntimeState,
  filter: PuzzleTrayFilter,
  edgeIds: ReadonlySet<string>,
): boolean {
  return piece.inTray && filter === 'edges' && !edgeIds.has(piece.pieceId);
}

/**
 * Re-deals the tray so pieces matching the filter hold the leading slots.
 *
 * Only pieces waiting in the tray participate, and they trade among the
 * slots they already own: a piece out on the table keeps its slot untouched
 * and the global slot permutation — which persistence validates — stays
 * intact. Matching pieces keep their current relative order, so the result
 * reads as the player's own sort rather than a reshuffle.
 *
 * Returns null when the row is already arranged or the filter hides nothing,
 * letting the caller skip a state patch.
 */
export function arrangeTrayForFilter(
  layout: PuzzleLayout,
  pieces: Record<string, PieceRuntimeState>,
  filter: PuzzleTrayFilter,
): Record<string, PieceRuntimeState> | null {
  if (filter === 'all') {
    return null;
  }

  const edgeIds = edgePieceIds(layout);
  const waiting = layout.pieces
    .filter((definition) => {
      const piece = pieces[definition.id];
      return piece?.inTray === true && !piece.locked;
    })
    .sort((a, b) => pieces[a.id].traySlot - pieces[b.id].traySlot);

  const ownedSlots = waiting
    .map((definition) => pieces[definition.id].traySlot)
    .sort((a, b) => a - b);
  const ordered = [
    ...waiting.filter((definition) => edgeIds.has(definition.id)),
    ...waiting.filter((definition) => !edgeIds.has(definition.id)),
  ];

  let changed = false;
  const next = { ...pieces };
  ordered.forEach((definition, orderIndex) => {
    const slot = ownedSlots[orderIndex];
    const current = next[definition.id];
    if (current.traySlot === slot) {
      return;
    }
    changed = true;
    next[definition.id] = {
      ...current,
      traySlot: slot,
      position: getTraySlotPosition(layout, slot, definition),
      rotation: slot % 2 === 0 ? TRAY_ROTATION : -TRAY_ROTATION,
    };
  });
  return changed ? next : null;
}

/**
 * Closes the gaps a released piece leaves in the waiting row.
 *
 * Waiting pieces take the lowest slots in the order they already had, and
 * every piece out of the tray — seated or loose on the table — takes the
 * slots after them, so the global slot permutation persistence validates
 * stays intact. A piece lifted but still in the player's hand is left alone
 * by the caller, which only compacts once a piece has been let go; a loose
 * piece dropped back later rejoins the end of the row.
 *
 * Returns null when the row has no gaps, letting the caller skip a patch.
 */
export function compactTrayRow(
  layout: PuzzleLayout,
  pieces: Record<string, PieceRuntimeState>,
): Record<string, PieceRuntimeState> | null {
  const bySlot = layout.pieces
    .filter((definition) => pieces[definition.id] !== undefined)
    .sort((a, b) => pieces[a.id].traySlot - pieces[b.id].traySlot);
  const waiting = bySlot.filter((definition) => {
    const piece = pieces[definition.id];
    return piece.inTray && !piece.locked;
  });
  const others = bySlot.filter((definition) => {
    const piece = pieces[definition.id];
    return !(piece.inTray && !piece.locked);
  });
  const slots = bySlot.map((definition) => pieces[definition.id].traySlot);

  let changed = false;
  const next = { ...pieces };
  [...waiting, ...others].forEach((definition, index) => {
    const slot = slots[index];
    const current = next[definition.id];
    if (current.traySlot === slot) {
      return;
    }
    changed = true;
    next[definition.id] = current.inTray
      ? {
          ...current,
          traySlot: slot,
          position: getTraySlotPosition(layout, slot, definition),
          rotation: slot % 2 === 0 ? TRAY_ROTATION : -TRAY_ROTATION,
        }
      : { ...current, traySlot: slot };
  });
  return changed ? next : null;
}
