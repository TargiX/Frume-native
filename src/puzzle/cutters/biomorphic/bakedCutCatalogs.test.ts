import { afterEach, describe, expect, it } from 'vitest';
import first from '../../../../assets/cuts/amoeba-coral/3x3/0.json';
import second from '../../../../assets/cuts/amoeba-coral/3x3/1.json';
import type { BakedCut } from './bakedCut';
import { type BakedCutLibrary, topologyFromLibrary } from './bakedCutLibrary';
import { clearBakedCutLibrary, installBakedCutLibraries } from './bakedCutSource';
import { CUT_STYLES } from './cutStyles';
import { BiomorphicCutter } from './BiomorphicCutter';
import { AmoebaCutter } from '../amoeba/AmoebaCutter';
import { AmoebaColumnarCutter, CrystalCutter, CrystalQuarteredCutter, LivingSpectrumCutter } from './createPhaseFieldCutter';
import { generateBiomorphicPiecesFromTopology } from './generateBiomorphic';

const oldCut = first as unknown as BakedCut, correctedCut = second as unknown as BakedCut;
const catalog = (entries: BakedCut[]): BakedCutLibrary => Object.fromEntries(CUT_STYLES.map(style => [style.id, { '3x3': entries }]));
const original = catalog([oldCut]), current = catalog([correctedCut]);
const image = { uri: 'file:///same-photograph.jpg', width: 900, height: 900 };
const cases = [
  ['living-fringe', BiomorphicCutter], ['living-spectrum', LivingSpectrumCutter],
  ['crystal-six', CrystalCutter], ['crystal-four', CrystalQuarteredCutter],
  ['amoeba-coral', AmoebaCutter], ['amoeba-columnar', AmoebaColumnarCutter],
] as const;
afterEach(() => clearBakedCutLibrary());

describe('immutable baked cut catalogs', () => {
  it.each(cases)('%s pins new games and preserves versionless saved geometry', async (style, cutter) => {
    installBakedCutLibraries({ 1: original, 2: current }, 2);
    const fresh = await cutter.generate(image, { difficulty: '3x3', seed: 'migration', boardMaxWidth: 330 });
    expect(fresh.cutDescriptor?.bakedLibraryVersion).toBe(2);
    const { bakedLibraryVersion: _version, ...legacy } = fresh.cutDescriptor!;
    const resumed = await cutter.generate(image, { difficulty: '3x3', cutDescriptor: legacy, boardMaxWidth: 330 });
    const expected = generateBiomorphicPiecesFromTopology(topologyFromLibrary(original, style, 3, 3, legacy.seed), 330, 330);
    expect(resumed.pieces).toEqual(expected);
    expect(resumed.pieces).not.toEqual(fresh.pieces);
    expect(resumed.cutDescriptor).toEqual(legacy);
  });
  it('keeps a versioned save stable after the current pool grows again', async () => {
    installBakedCutLibraries({ 1: original, 2: current }, 2);
    const first = await AmoebaCutter.generate(image, { difficulty: '3x3', seed: 'pool-growth', boardMaxWidth: 330 });
    const expanded = catalog([oldCut, correctedCut, oldCut]);
    installBakedCutLibraries({ 1: original, 2: current, 3: expanded }, 3);
    const restored = await AmoebaCutter.generate(image, { difficulty: '3x3', cutDescriptor: first.cutDescriptor, boardMaxWidth: 330 });
    expect(restored.pieces).toEqual(first.pieces);
    expect(restored.cutDescriptor).toEqual(first.cutDescriptor);
    const fresh = await AmoebaCutter.generate(image, { difficulty: '3x3', seed: 'pool-growth', boardMaxWidth: 330 });
    expect(fresh.cutDescriptor?.bakedLibraryVersion).toBe(3);
  });
  it('refuses an unavailable saved catalog instead of substituting current shapes', async () => {
    installBakedCutLibraries({ 1: original, 2: current }, 2);
    await expect(AmoebaCutter.generate(image, { difficulty: '3x3', cutDescriptor: {
      cutterId: 'amoeba', version: 1, seed: 'saved', rows: 3, columns: 3, bakedLibraryVersion: 99,
    } })).rejects.toThrow('Unsupported baked cut library version 99');
  });
  it('requires the historical catalog when registering a current one', () => {
    expect(() => installBakedCutLibraries({ 2: current }, 2)).toThrow(/registration/);
    expect(() => installBakedCutLibraries({ 1: original }, 2)).toThrow(/registration/);
  });
});
