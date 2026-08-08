import { describe, expect, it } from 'vitest';

import {
  availableSizes,
  nearestAvailableSize,
  supportsSize,
} from './availableSizes';
import { PUZZLE_SIZES } from '../types';

describe('availableSizes', () => {
  it('offers the whole ladder for cutters solved on the spot', () => {
    const every = PUZZLE_SIZES.map((size) => size.id);
    expect(availableSizes('classic')).toEqual(every);
    expect(availableSizes('organic')).toEqual(every);
  });

  it('offers a simulated style only the grids that were baked', () => {
    const sizes = availableSizes('biomorphic');
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes).toEqual(['3x3', '4x4', '5x5']);
  });

  it('never offers a simulated style a size nobody baked', () => {
    expect(supportsSize('biomorphic', '10x10')).toBe(false);
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
    // 7x7 is 49 pieces; the closest baked grid is 5x5 at 25.
    expect(nearestAvailableSize('biomorphic', '7x7')).toBe('5x5');
    expect(nearestAvailableSize('amoeba', '14x14')).toBe('5x5');
  });
});
