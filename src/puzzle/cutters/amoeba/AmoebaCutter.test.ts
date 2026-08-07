import { describe, expect, it } from 'vitest';

import { getCutter } from '../registry';
import { BiomorphicCutter } from '../biomorphic';
import { AmoebaCutter } from './AmoebaCutter';

const image = {
  uri: 'https://images.example/amoeba-puzzle.jpg?secret=not-persisted',
  width: 1600,
  height: 1200,
};

describe('AmoebaCutter', () => {
  it('is registered as its own premium cut style', () => {
    expect(AmoebaCutter.meta.id).toBe('amoeba');
    expect(getCutter('amoeba')).toBe(AmoebaCutter);
  });

  it('produces a version-1 descriptor without leaking the source seed', async () => {
    const layout = await AmoebaCutter.generate(image, {
      difficulty: 'medium',
      seed: 'first-amoeba-cut',
    });

    expect(layout.cutterId).toBe('amoeba');
    expect(layout.cutDescriptor).toMatchObject({
      cutterId: 'amoeba',
      version: 1,
      rows: 4,
      columns: 4,
    });
    expect(layout.cutDescriptor?.seed).toMatch(/^bio-[\da-f]{8}$/);
    expect(layout.cutDescriptor?.seed).not.toContain('secret');
    expect(layout.pieces).toHaveLength(16);
    layout.pieces.forEach((piece) => {
      expect(piece.path.startsWith('M ')).toBe(true);
      expect(piece.path.endsWith('Z')).toBe(true);
    });
  }, 60_000);

  it('reproduces a layout from its descriptor and differs from Living', async () => {
    const first = await AmoebaCutter.generate(image, {
      difficulty: 'medium',
      seed: 'amoeba-repeat',
    });
    const second = await AmoebaCutter.generate(image, {
      difficulty: 'medium',
      cutDescriptor: first.cutDescriptor,
    });
    expect(second.pieces).toEqual(first.pieces);

    const living = await BiomorphicCutter.generate(image, {
      difficulty: 'medium',
      seed: 'amoeba-repeat',
    });
    expect(living.pieces).not.toEqual(first.pieces);
    // Three production-resolution boards: an Amoeba 4x4 solves in about 49 s
    // and a Living one in 16 s on an idle laptop, so this sat just under the
    // old 120 s limit and tipped over it whenever the suite loaded the machine.
    // The generation cost is the reason cuts are moving to a baked library;
    // once the cutters read from it this test becomes instant.
  }, 300_000);

  it('rejects descriptors from other cutters', async () => {
    const living = await BiomorphicCutter.generate(image, {
      difficulty: 'medium',
      seed: 'wrong-descriptor',
    });
    await expect(
      AmoebaCutter.generate(image, {
        difficulty: 'medium',
        cutDescriptor: living.cutDescriptor,
      }),
    ).rejects.toThrow('Cannot use a biomorphic cut descriptor with Amoeba');
  }, 60_000);
});
