import { describe, expect, it } from 'vitest';

import type { PieceRuntimeState } from '../types/engine';
import type { PuzzleLayout, PuzzlePieceDefinition } from '../types/layout';
import { getTraySlotPosition } from './tray';
import {
  arrangeTrayForFilter,
  edgePieceIds,
  isPieceHiddenByTrayFilter,
  supportsEdgeTrayFilter,
} from './trayFilter';

function gridPiece(
  row: number,
  col: number,
  columns: number,
): PuzzlePieceDefinition {
  const x = col * 30;
  const y = row * 20;
  return {
    id: `p-${row}-${col}`,
    index: row * columns + col,
    row,
    col,
    path: `M ${x} ${y} L ${x + 30} ${y} L ${x + 30} ${y + 20} L ${x} ${y + 20} Z`,
    bounds: { x, y, width: 30, height: 20 },
    clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
    correctPosition: { x, y },
    correctRotation: 0,
    neighborIds: [],
  };
}

function gridLayout(rows = 3, columns = 3): PuzzleLayout {
  const pieces: PuzzlePieceDefinition[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      pieces.push(gridPiece(row, col, columns));
    }
  }
  return {
    cutterId: 'classic',
    image: { uri: 'https://example.test/puzzle.jpg', width: 1200, height: 800 },
    boardSize: { width: columns * 30, height: rows * 20 },
    pieces,
  };
}

function waiting(pieceId: string, traySlot: number): PieceRuntimeState {
  return {
    pieceId,
    position: { x: 0, y: 0 },
    rotation: 0,
    locked: false,
    zIndex: 0,
    inTray: true,
    traySlot,
  };
}

/** A waiting piece resting at the real position of the slot it owns. */
function waitingAt(
  layout: PuzzleLayout,
  definition: PuzzlePieceDefinition,
  traySlot: number,
): PieceRuntimeState {
  return {
    ...waiting(definition.id, traySlot),
    position: getTraySlotPosition(layout, traySlot, definition),
  };
}

function dealtPieces(
  layout: PuzzleLayout,
): Record<string, PieceRuntimeState> {
  return Object.fromEntries(
    layout.pieces.map((definition, index) => [
      definition.id,
      waitingAt(layout, definition, index),
    ]),
  );
}

function slotOrder(pieces: Record<string, PieceRuntimeState>): number[] {
  return Object.values(pieces)
    .map((piece) => piece.traySlot)
    .sort((a, b) => a - b);
}

describe('edgePieceIds', () => {
  it('marks the outer ring of a complete lattice', () => {
    const ids = edgePieceIds(gridLayout(3, 3));

    expect(ids.size).toBe(8);
    expect(ids.has('p-1-1')).toBe(false);
  });

  it('treats single-row and single-column cuts as all edges', () => {
    expect(edgePieceIds(gridLayout(1, 4)).size).toBe(4);
    expect(edgePieceIds(gridLayout(4, 1)).size).toBe(4);
    expect(edgePieceIds(gridLayout(1, 1)).size).toBe(1);
  });
});

describe('supportsEdgeTrayFilter', () => {
  it('covers the lattice cutters and not the irregular ones', () => {
    expect(supportsEdgeTrayFilter('classic')).toBe(true);
    expect(supportsEdgeTrayFilter('organic')).toBe(true);
    expect(supportsEdgeTrayFilter('biomorphic')).toBe(false);
    expect(supportsEdgeTrayFilter('crystal')).toBe(false);
  });
});

describe('isPieceHiddenByTrayFilter', () => {
  const edges = new Set(['p-0-0']);

  it('hides only interior pieces still waiting in the tray', () => {
    expect(
      isPieceHiddenByTrayFilter(waiting('p-1-1', 0), 'edges', edges),
    ).toBe(true);
    expect(
      isPieceHiddenByTrayFilter(waiting('p-0-0', 1), 'edges', edges),
    ).toBe(false);
    expect(
      isPieceHiddenByTrayFilter(
        { ...waiting('p-1-1', 0), inTray: false },
        'edges',
        edges,
      ),
    ).toBe(false);
    expect(
      isPieceHiddenByTrayFilter(waiting('p-1-1', 0), 'all', edges),
    ).toBe(false);
  });
});

describe('arrangeTrayForFilter', () => {
  it('returns null for the all-pieces view', () => {
    const layout = gridLayout();

    expect(
      arrangeTrayForFilter(layout, dealtPieces(layout), 'all'),
    ).toBeNull();
  });

  it('moves edge pieces to the front of the waiting row, keeping order', () => {
    const layout = gridLayout();
    // Deal slots so edges and the centre interleave.
    const pieces = dealtPieces(layout);

    const arranged = arrangeTrayForFilter(layout, pieces, 'edges');

    expect(arranged).not.toBeNull();
    const centre = arranged!['p-1-1'];
    expect(centre.traySlot).toBe(8);
    layout.pieces.forEach((definition) => {
      const piece = arranged![definition.id];
      if (definition.id === 'p-1-1') {
        return;
      }
      expect(piece.traySlot).toBeLessThan(8);
      expect(piece.position).toEqual(
        getTraySlotPosition(layout, piece.traySlot, definition),
      );
    });
    // The whole set still holds every slot exactly once.
    expect(slotOrder(arranged!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('re-deals only the slots the waiting pieces own', () => {
    const layout = gridLayout();
    const pieces = dealtPieces(layout);
    // Two edge pieces out on the table keep their leading slots; the waiting
    // row re-deals the remaining seven, so the visible run starts at slot 2.
    pieces['p-0-0'] = { ...pieces['p-0-0'], inTray: false };
    pieces['p-0-1'] = { ...pieces['p-0-1'], inTray: false };

    const arranged = arrangeTrayForFilter(layout, pieces, 'edges')!;

    expect(arranged['p-0-0'].traySlot).toBe(0);
    expect(arranged['p-0-1'].traySlot).toBe(1);
    expect(arranged['p-1-1'].traySlot).toBe(8);
    const waitingSlots = layout.pieces
      .filter((definition) => arranged[definition.id].inTray)
      .map((definition) => arranged[definition.id].traySlot)
      .sort((a, b) => a - b);
    expect(waitingSlots).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(slotOrder(arranged)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not disturb a locked piece\u2019s slot', () => {
    const layout = gridLayout();
    const pieces = dealtPieces(layout);
    pieces['p-0-0'] = {
      ...pieces['p-0-0'],
      inTray: false,
      locked: true,
    };

    const arranged = arrangeTrayForFilter(layout, pieces, 'edges')!;

    expect(arranged['p-0-0'].traySlot).toBe(0);
    expect(arranged['p-0-0'].locked).toBe(true);
    expect(arranged['p-1-1'].traySlot).toBe(8);
    expect(slotOrder(arranged)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('returns null once the waiting row is already partitioned', () => {
    const layout = gridLayout();
    const pieces = dealtPieces(layout);

    const arranged = arrangeTrayForFilter(layout, pieces, 'edges')!;

    expect(arrangeTrayForFilter(layout, arranged, 'edges')).toBeNull();
  });
});
