import { describe, expect, it } from 'vitest';

import type { PuzzlePieceDefinition } from '../types';
import { getPieceOverflowMargin } from './pieceOverflowMargin';

function piece(width: number, height: number): PuzzlePieceDefinition {
  return {
    id: `${width}x${height}`,
    index: 0,
    row: 0,
    col: 0,
    path: 'M0 0',
    bounds: { x: 0, y: 0, width, height },
    clipRegion: { x: 0, y: 0, width: 1, height: 1 },
    correctPosition: { x: 0, y: 0 },
    correctRotation: 0,
    neighborIds: [],
  };
}

describe('piece overflow margin', () => {
  it('keeps enough canvas around the board for the largest whole piece', () => {
    expect(getPieceOverflowMargin([piece(92, 74), piece(61, 118)])).toBe(126);
  });

  it('keeps a small shadow allowance even for an empty layout', () => {
    expect(getPieceOverflowMargin([])).toBe(8);
  });
});
