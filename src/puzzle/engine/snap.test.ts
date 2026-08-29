import { describe, expect, it } from 'vitest';

import type { PuzzlePieceDefinition } from '../types/layout';
import {
  MAX_SNAP_THRESHOLD,
  MIN_SNAP_THRESHOLD,
  SNAP_THRESHOLD_RATIO,
} from './constants';
import { resolveSnapPosition, shouldSnap, snapThreshold } from './snap';

/** Creates a minimal piece definition with configurable rendered bounds. */
function piece(width: number, height: number): PuzzlePieceDefinition {
  return {
    id: 'piece',
    index: 0,
    row: 0,
    col: 0,
    path: 'M 0 0 Z',
    bounds: { x: 100, y: 100, width, height },
    clipRegion: { x: 0, y: 0, width: 1, height: 1 },
    correctPosition: { x: 100, y: 100 },
    correctRotation: 0,
    neighborIds: [],
  };
}

describe('snapThreshold', () => {
  it('scales with the smaller bounds dimension', () => {
    const mid = piece(84, 96);
    expect(snapThreshold(mid)).toBeCloseTo(84 * SNAP_THRESHOLD_RATIO);
  });

  it('never drops below the finger-accuracy floor', () => {
    expect(snapThreshold(piece(10, 10))).toBe(MIN_SNAP_THRESHOLD);
  });

  it('never exceeds the deliberate-placement ceiling', () => {
    expect(snapThreshold(piece(400, 400))).toBe(MAX_SNAP_THRESHOLD);
  });
});

describe('shouldSnap', () => {
  it('snaps just inside the threshold and refuses just beyond it', () => {
    // Threshold here is 84 * 0.3 = 25.2, so 25 seats and 26 does not.
    const p = piece(84, 96);

    expect(shouldSnap(p, { x: 100 + 25, y: 100 })).toBe(true);
    expect(shouldSnap(p, { x: 100 + 26, y: 100 })).toBe(false);
  });

  it('measures Euclidean distance, not per-axis offsets', () => {
    const p = piece(84, 96);
    const threshold = snapThreshold(p);
    const diagonal = threshold / Math.SQRT2;

    expect(shouldSnap(p, { x: 100 + diagonal, y: 100 + diagonal })).toBe(true);
    expect(
      shouldSnap(p, { x: 100 + threshold, y: 100 + threshold }),
    ).toBe(false);
  });

  it('does not seat a 14x14 piece dropped a full cell away', () => {
    // Phone-width 14x14: ~26pt cell pitch, ~36pt bounds with tab protrusions.
    // The old fixed 24pt radius seated a piece released almost a whole cell
    // off target; the piece-scaled radius must stay under half the pitch.
    const small = piece(36, 36);

    expect(snapThreshold(small)).toBeLessThan(26 / 2);
    expect(shouldSnap(small, { x: 100 + 24, y: 100 })).toBe(false);
  });

  it('is more forgiving for large pieces than the old fixed radius', () => {
    const large = piece(170, 160);

    expect(shouldSnap(large, { x: 100 + 40, y: 100 })).toBe(true);
  });
});

describe('resolveSnapPosition', () => {
  it('returns the correct position inside the radius and the drop point outside it', () => {
    const p = piece(84, 96);

    expect(resolveSnapPosition(p, { x: 110, y: 100 })).toEqual({ x: 100, y: 100 });
    expect(resolveSnapPosition(p, { x: 190, y: 100 })).toEqual({ x: 190, y: 100 });
  });
});
