import { describe, expect, it } from 'vitest';

import {
  BOARD_PIECE_ACTIVATION_DISTANCE,
  hasBoardPieceDragIntent,
} from './pieceDragIntent';

describe('board piece drag intent', () => {
  it('activates for a precise two-point correction after a wrong drop', () => {
    expect(BOARD_PIECE_ACTIVATION_DISTANCE).toBeLessThanOrEqual(2);
    expect(hasBoardPieceDragIntent(2, 0)).toBe(true);
  });

  it('does not claim a stationary touch', () => {
    expect(hasBoardPieceDragIntent(0, 0)).toBe(false);
  });
});
