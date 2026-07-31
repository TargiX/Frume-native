import { describe, expect, it } from 'vitest';

import {
  nextPuzzleGuideMode,
  PUZZLE_GUIDE_OPTIONS,
  puzzleGuideLabel,
} from './guide';

describe('puzzle board guides', () => {
  it('offers the four help levels from no hint to photo overlay', () => {
    expect(PUZZLE_GUIDE_OPTIONS.map((option) => option.id)).toEqual([
      'none',
      'grid',
      'cuts',
      'image',
    ]);
  });

  it('cycles every level from the in-game guide control', () => {
    expect(nextPuzzleGuideMode('none')).toBe('grid');
    expect(nextPuzzleGuideMode('grid')).toBe('cuts');
    expect(nextPuzzleGuideMode('cuts')).toBe('image');
    expect(nextPuzzleGuideMode('image')).toBe('none');
    expect(puzzleGuideLabel('image')).toBe('Photo');
  });
});
