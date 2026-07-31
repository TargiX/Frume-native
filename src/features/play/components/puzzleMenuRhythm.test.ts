import { describe, expect, it } from 'vitest';

import { PUZZLE_MENU_RHYTHM } from './puzzleMenuRhythm';

describe('puzzle menu vertical rhythm', () => {
  it('keeps related copy closer than the controls it describes', () => {
    expect(PUZZLE_MENU_RHYTHM.titleToDetail).toBeLessThan(
      PUZZLE_MENU_RHYTHM.detailToControls,
    );
  });

  it('separates independent sections more than related content', () => {
    expect(PUZZLE_MENU_RHYTHM.betweenSections).toBeGreaterThanOrEqual(
      PUZZLE_MENU_RHYTHM.detailToControls * 2,
    );
  });

  it('uses content padding so buttons can grow with Dynamic Type', () => {
    expect(PUZZLE_MENU_RHYTHM.controlPaddingVertical).toBeGreaterThanOrEqual(12);
  });
});
