import { describe, expect, it } from 'vitest';

import { getTrayMetrics, getTraySlotPosition, trayDepth, trayLanes } from './tray';
import type { PuzzleLayout, PuzzlePieceDefinition } from '../types/layout';

function piece(id: string): PuzzlePieceDefinition {
  return {
    id,
    index: Number(id),
    row: 0,
    column: 0,
    path: 'M0 0 L40 0 L40 40 L0 40 Z',
    bounds: { x: 0, y: 0, width: 40, height: 40 },
    correctPosition: { x: 0, y: 0 },
    correctRotation: 0,
    neighborIds: [],
  } as unknown as PuzzlePieceDefinition;
}

function layoutOf(count: number): PuzzleLayout {
  return {
    cutterId: 'classic',
    image: { uri: 'file:///a.jpg', width: 400, height: 400 },
    boardSize: { width: 400, height: 400 },
    trayPlacement: 'bottom',
    pieces: Array.from({ length: count }, (_, index) => piece(String(index))),
  } as unknown as PuzzleLayout;
}

describe('trayLanes', () => {
  it('keeps a small puzzle on one row', () => {
    expect(trayLanes(9)).toBe(1);
    expect(trayLanes(40)).toBe(1);
  });

  it('deepens the shelf as the pile grows', () => {
    expect(trayLanes(49)).toBe(2);
    expect(trayLanes(196)).toBe(3);
  });

  it('never spends more than two rows of table on the shelf', () => {
    expect(trayDepth(196)).toBe(2);
    expect(trayDepth(49)).toBe(2);
    expect(trayDepth(9)).toBe(1);
  });
});

describe('tray slots across lanes', () => {
  it('fills the depth first so scrolling reveals whole columns', () => {
    const layout = layoutOf(196);
    const metrics = getTrayMetrics(layout);
    expect(metrics.lanes).toBe(3);

    const first = getTraySlotPosition(layout, 0, piece('0'));
    const second = getTraySlotPosition(layout, 1, piece('1'));
    const fourth = getTraySlotPosition(layout, 3, piece('3'));

    // Neighbours are stacked, the fourth starts the next column.
    expect(second.x).toBeCloseTo(first.x, 6);
    expect(second.y).toBeGreaterThan(first.y);
    expect(fourth.x).toBeGreaterThan(first.x);
    expect(fourth.y).toBeCloseTo(first.y, 6);
  });

  it('shortens the scrollable run by the number of rows', () => {
    const oneRow = getTrayMetrics(layoutOf(40));
    const threeRows = getTrayMetrics(layoutOf(196));

    const perLaneOfOne = 40;
    const perLaneOfThree = Math.ceil(196 / 3);
    // Five times the pieces, but well under twice the run to scroll.
    expect(threeRows.contentExtent / oneRow.contentExtent).toBeLessThan(
      perLaneOfThree / perLaneOfOne + 0.5,
    );
  });

  it('keeps every piece inside the shelf', () => {
    const layout = layoutOf(196);
    const metrics = getTrayMetrics(layout);
    for (const slot of [0, 1, 2, 97, 195]) {
      const position = getTraySlotPosition(layout, slot, piece(String(slot)));
      expect(position.y).toBeGreaterThanOrEqual(metrics.top - 1);
      expect(position.y + 40).toBeLessThanOrEqual(
        metrics.top + metrics.height + 1,
      );
    }
  });
});
