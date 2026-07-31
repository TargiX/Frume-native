import { describe, expect, it } from 'vitest';

import {
  PUZZLE_MENU_MOTION,
  puzzleMenuHudSide,
} from './puzzleMenuPresentation';

describe('puzzle menu presentation', () => {
  it('anchors the trigger to the same side as the landscape sheet', () => {
    expect(puzzleMenuHudSide()).toBe('right');
  });

  it('keeps dismissal quicker than presentation', () => {
    expect(PUZZLE_MENU_MOTION.exitDurationMs).toBeLessThan(
      PUZZLE_MENU_MOTION.enterDurationMs,
    );
  });

  it('provides a short reduced-motion fade', () => {
    expect(PUZZLE_MENU_MOTION.reducedDurationMs).toBeLessThanOrEqual(150);
  });
});
