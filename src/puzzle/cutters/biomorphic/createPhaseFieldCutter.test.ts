import { afterEach, describe, expect, it } from 'vitest';

import { BAKED_CUT_LIBRARY } from './bakedLibrary.generated';
import { clearBakedCutLibrary, installBakedCutLibrary } from './bakedCutSource';
import {
  AmoebaColumnarCutter,
  CrystalCutter,
  CrystalQuarteredCutter,
  LivingSpectrumCutter,
} from './createPhaseFieldCutter';
import { getCutter } from '../registry';

const image = {
  uri: 'https://images.unsplash.com/photo-1',
  width: 1_200,
  height: 900,
};

const NEW_CUTTERS = [
  LivingSpectrumCutter,
  CrystalCutter,
  CrystalQuarteredCutter,
  AmoebaColumnarCutter,
];

afterEach(() => {
  clearBakedCutLibrary();
});

describe('phase-field cutters', () => {
  it('registers each style under its own id', () => {
    for (const cutter of NEW_CUTTERS) {
      expect(getCutter(cutter.meta.id)).toBe(cutter);
    }
  });

  it('serves a baked cut for every shipped difficulty', async () => {
    installBakedCutLibrary(BAKED_CUT_LIBRARY);
    for (const cutter of NEW_CUTTERS) {
      for (const [difficulty, count] of [
        ['easy', 9],
        ['medium', 16],
        ['hard', 25],
      ] as const) {
        const layout = await cutter.generate(image, {
          difficulty,
          boardMaxWidth: 400,
          boardMaxHeight: 300,
        });
        expect(layout.pieces, `${cutter.meta.id} ${difficulty}`).toHaveLength(
          count,
        );
        expect(layout.cutterId).toBe(cutter.meta.id);
      }
    }
  }, 120_000);

  it('draws a different cut per style from the same photograph', async () => {
    installBakedCutLibrary(BAKED_CUT_LIBRARY);
    const seeds = await Promise.all(
      NEW_CUTTERS.map(async (cutter) => {
        const layout = await cutter.generate(image, { difficulty: 'easy' });
        return layout.cutDescriptor?.seed;
      }),
    );
    expect(new Set(seeds).size).toBe(NEW_CUTTERS.length);
  }, 120_000);

  it('refuses a descriptor belonging to another cutter', async () => {
    await expect(
      CrystalCutter.generate(image, {
        difficulty: 'easy',
        cutDescriptor: {
          cutterId: 'amoeba',
          version: 1,
          seed: 'seed',
          rows: 3,
          columns: 3,
        },
      }),
    ).rejects.toThrow('Cannot use a amoeba cut descriptor with Crystal');
  });
});
