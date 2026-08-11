import { describe, expect, it } from 'vitest';

import {
  availableSizes,
  nearestAvailableSize,
  supportsSize,
} from './availableSizes';
import { BAKED_CUT_LIBRARY } from './biomorphic/bakedLibrary.generated';
import { PUZZLE_SIZES } from '../types';

describe('availableSizes', () => {
  it('offers the whole ladder for cutters solved on the spot', () => {
    const every = PUZZLE_SIZES.map((size) => size.id);
    expect(availableSizes('classic')).toEqual(every);
    expect(availableSizes('organic')).toEqual(every);
  });

  it('offers a simulated style exactly the grids that were baked', () => {
    // Asserted against the library rather than against a list of sizes: the
    // bake job adds grids over time, and a snapshot here would fail the moment
    // it did, for no reason the reader could act on.
    const sizes = availableSizes('biomorphic');
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of PUZZLE_SIZES) {
      const baked =
        (BAKED_CUT_LIBRARY['living-fringe']?.[size.id]?.length ?? 0) > 0;
      expect(sizes.includes(size.id)).toBe(baked);
    }
  });

  it('never offers a simulated style a size nobody baked', () => {
    // 196 pieces is over an hour of solving per cut, so it is deliberately
    // absent from the library and must stay unavailable.
    expect(supportsSize('biomorphic', '14x14')).toBe(false);
    expect(supportsSize('crystal', '14x14')).toBe(false);
    expect(supportsSize('classic', '14x14')).toBe(true);
  });
});

describe('nearestAvailableSize', () => {
  it('keeps the wanted size when the style reaches it', () => {
    expect(nearestAvailableSize('biomorphic', '4x4')).toBe('4x4');
    expect(nearestAvailableSize('classic', '14x14')).toBe('14x14');
  });

  it('moves the choice as little as possible when it does not', () => {
    // 196 pieces is never baked, so the answer is whatever the style's largest
    // baked grid happens to be — the last one it offers.
    const largest = availableSizes('amoeba').at(-1);
    expect(nearestAvailableSize('amoeba', '14x14')).toBe(largest);
    expect(nearestAvailableSize('biomorphic', '14x14')).toBe(
      availableSizes('biomorphic').at(-1),
    );
  });
});
