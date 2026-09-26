import { describe, expect, it, vi } from 'vitest';

// Failure cases use a private catalog copy; historical product pools stay
// immutable even when a test simulates an incomplete packaged library.
vi.mock('./biomorphic/bakedLibrary.generated', async importOriginal => {
  const original = await importOriginal<typeof import('./biomorphic/bakedLibrary.generated')>();
  return { ...original, BAKED_CUT_LIBRARY: structuredClone(original.BAKED_CUT_LIBRARY) };
});

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

  it.each(['biomorphic', 'living-spectrum', 'crystal', 'crystal-quartered', 'amoeba', 'amoeba-columnar'] as const)(
    'offers the new 100- and 196-piece pools for %s', cutter => {
      expect(supportsSize(cutter, '10x10')).toBe(true);
      expect(supportsSize(cutter, '14x14')).toBe(true);
    },
  );
});

describe('nearestAvailableSize', () => {
  it('keeps the wanted size when the style reaches it', () => {
    expect(nearestAvailableSize('biomorphic', '4x4')).toBe('4x4');
    expect(nearestAvailableSize('classic', '14x14')).toBe('14x14');
  });

  it('moves the choice as little as possible when it does not', () => {
    const original = BAKED_CUT_LIBRARY['amoeba-coral'];
    try {
      BAKED_CUT_LIBRARY['amoeba-coral'] = { ...original, '10x10': undefined, '14x14': undefined };
      expect(supportsSize('amoeba', '14x14')).toBe(false);
      expect(nearestAvailableSize('amoeba', '14x14')).toBe('7x7');
      expect(nearestAvailableSize('amoeba', '10x10')).toBe('7x7');
    } finally {
      BAKED_CUT_LIBRARY['amoeba-coral'] = original;
    }
  });
});
