import { describe, expect, it } from 'vitest';

import {
  formatPuzzleElapsed,
  puzzleStatusLabel,
} from './gameStatusPresentation';

describe('visible puzzle status', () => {
  it('formats elapsed time without negative or fractional seconds', () => {
    expect(formatPuzzleElapsed(-1)).toBe('0:00');
    expect(formatPuzzleElapsed(65_999)).toBe('1:05');
  });

  it('pairs visual progress and calm elapsed time', () => {
    expect(puzzleStatusLabel(7, 16, 65_999)).toBe('7 / 16 · 1:05');
  });
});
