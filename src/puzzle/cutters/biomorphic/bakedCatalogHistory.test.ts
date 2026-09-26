import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bakedCutOnDisk } from './bakedCutOnDisk';
import { BAKED_CUT_LIBRARY_V1 } from './bakedLibrary.v1';
import { BAKED_CUT_LIBRARY_V2 } from './bakedLibrary.v2';
import { BAKED_CUT_LIBRARIES, BAKED_CUT_LIBRARY, BAKED_CUT_LIBRARY_VERSION } from './bakedLibrary.generated';

describe('historical catalog identity', () => {
  it.each([
    { version: 1, library: BAKED_CUT_LIBRARY_V1, count: 168,
      fingerprint: '2c593fbe902227d4398c476608d6532fbe08c6ab1fd4e8157483aef3f58303fc' },
    { version: 2, library: BAKED_CUT_LIBRARY_V2, count: 192,
      fingerprint: 'a24baaa0112a271c33ae1804b4ab2820f4f86dd1df7f1396b1e7333d2aeadbf3' },
  ])('preserves catalog $version geometry and its position in the seed lookup', catalog => {
    const hash = createHash('sha256');
    const groups = Object.entries(catalog.library).flatMap(([style, grids]) =>
      Object.entries(grids ?? {}).map(([grid, entries]) => ({ key: `${style}/${grid}`, entries })));
    groups.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    let count = 0;
    for (const { key, entries } of groups) entries?.forEach((cut, index) => {
      // Remote entries hash as their payload, so moving a board out of the
      // bundle can never pass for a change of geometry.
      hash.update(JSON.stringify([key, index, bakedCutOnDisk(cut)]) + '\n'); count++;
    });
    expect(count).toBe(catalog.count);
    expect(hash.digest('hex')).toBe(catalog.fingerprint);
  });

  it('selects catalog 2 for new games and still registers the original pool', () => {
    expect(BAKED_CUT_LIBRARY_VERSION).toBe(2);
    expect(BAKED_CUT_LIBRARY).toBe(BAKED_CUT_LIBRARY_V2);
    expect(BAKED_CUT_LIBRARIES[1]).toBe(BAKED_CUT_LIBRARY_V1);
    expect(BAKED_CUT_LIBRARIES[2]).toBe(BAKED_CUT_LIBRARY_V2);
  });
});
