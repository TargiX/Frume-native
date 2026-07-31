import { describe, expect, it } from 'vitest';

import { createMusicTrackOrder } from './musicTrackOrder';

describe('puzzle music order', () => {
  it('includes every track exactly once', () => {
    expect([...createMusicTrackOrder(0.72)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('rotates the family-spaced playlist from a session-specific start', () => {
    expect(createMusicTrackOrder(0)).toEqual([0, 2, 4, 1, 3, 5]);
    expect(createMusicTrackOrder(0.5)).toEqual([1, 3, 5, 0, 2, 4]);
  });
});
