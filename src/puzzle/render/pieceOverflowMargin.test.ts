import { describe, expect, it } from 'vitest';

import type { PuzzlePieceDefinition } from '../types';
import {
  getPieceOverflowMargin,
  resolveWorkspaceInset,
} from './pieceOverflowMargin';

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

describe('workspace inset', () => {
  it('keeps the overflow margin when the surface already fills the screen', () => {
    expect(resolveWorkspaceInset(669, 190, 746)).toBe(190);
  });

  it('fills a short table to the viewport so the camera has nothing to centre', () => {
    // A 3:2 photo cut into 49 on a 402×874 phone: 415 of surface, 746 of view.
    const inset = resolveWorkspaceInset(415, 78, 746);

    expect(inset).toBeCloseTo(165.5);
    expect(415 + inset * 2).toBeCloseTo(746);
  });

  it('falls back to the overflow margin without a known viewport', () => {
    expect(resolveWorkspaceInset(415, 78)).toBe(78);
  });
});
