import { afterEach, describe, expect, it, vi } from 'vitest';

import { listCutters } from './registry';
import {
  installBakedCutLibraries,
  installRemoteCutLoader,
} from './biomorphic/bakedCutSource';
import { bakedCutOnDisk } from './biomorphic/bakedCutOnDisk';
import {
  BAKED_CUT_LIBRARIES,
  BAKED_CUT_LIBRARY_VERSION,
} from './biomorphic/bakedLibrary.generated';
import { isPremiumCutter } from '../../premium/access';

afterEach(() => {
  installRemoteCutLoader(async (remote) => bakedCutOnDisk({ remote }));
});

// Every cutter that reads the baked library must fetch a remote board before
// cutting it; one that forgets fails only on the biggest boards, in the field.
describe('remote boards', () => {
  const baked = listCutters().filter(
    ({ meta }) => isPremiumCutter(meta.id) && meta.id !== 'organic',
  );

  it.each(baked.map((cutter) => [cutter.meta.id, cutter] as const))(
    '%s loads a 196-piece board it does not ship',
    async (_id, cutter) => {
      installBakedCutLibraries(
        structuredClone(BAKED_CUT_LIBRARIES) as never,
        BAKED_CUT_LIBRARY_VERSION,
      );
      const loader = vi.fn(async (remote: { key: string; sha256: string }) =>
        bakedCutOnDisk({ remote }),
      );
      installRemoteCutLoader(loader);
      const layout = await cutter.generate(
        { uri: 'photo', width: 1600, height: 1600 },
        { difficulty: '14x14', boardMaxWidth: 330, boardMaxHeight: 330 },
      );
      expect(layout.pieces).toHaveLength(196);
      expect(loader).toHaveBeenCalledTimes(1);
    },
  );
});
