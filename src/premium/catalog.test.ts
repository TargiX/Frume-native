import { describe, expect, it } from 'vitest';

import {
  PREMIUM_CUT_CATALOG,
  PREMIUM_CUT_CATALOG_COUNT,
  PREMIUM_CUT_CATALOG_LIST,
} from './catalog';

describe('Premium Cuts catalog promise', () => {
  it('derives the exact seven-style purchase promise from one catalog', () => {
    expect(PREMIUM_CUT_CATALOG.map(({ id }) => id)).toEqual([
      'organic',
      'biomorphic',
      'living-spectrum',
      'crystal',
      'crystal-quartered',
      'amoeba',
      'amoeba-columnar',
    ]);
    expect(PREMIUM_CUT_CATALOG_COUNT).toBe(7);
    expect(PREMIUM_CUT_CATALOG_LIST).toBe(
      'Organic, Living, Living spectrum, Crystal, Crystal quartered, Amoeba, and Amoeba columnar',
    );
  });
});
