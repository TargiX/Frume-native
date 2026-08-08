import { describe, expect, it } from 'vitest';

import type { PuzzleLayout } from '../../types/layout';
import { getCutter, listCutters } from '../registry';
import { BiomorphicCutter } from './BiomorphicCutter';

const image = {
  uri: 'https://images.example/biomorphic-puzzle.jpg?secret=not-persisted',
  width: 1600,
  height: 1200,
};

function normalizedPathNumbers(layout: PuzzleLayout, pieceIndex: number): number[] {
  const numbers =
    layout.pieces[pieceIndex].path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? [];
  return numbers.map((value, index) => {
    const dimension =
      index % 2 === 0 ? layout.boardSize.width : layout.boardSize.height;
    return Number(value) / dimension;
  });
}

describe('BiomorphicCutter', () => {
  it('is a separately registered plugin while Fractal remains reserved', () => {
    expect(BiomorphicCutter.meta.id).toBe('biomorphic');
    expect(getCutter('biomorphic')).toBe(BiomorphicCutter);
    expect(listCutters().map(({ meta }) => meta.id)).toEqual([
      'classic',
      'organic',
      'biomorphic',
      'living-spectrum',
      'crystal',
      'crystal-quartered',
      'amoeba',
      'amoeba-columnar',
    ]);
    expect(() => getCutter('fractal')).toThrow(
      'Puzzle cutter "fractal" is not available',
    );
  });

  it('creates stable IDs, variable adjacency, and closed flowing SVG paths', async () => {
    const layout = await BiomorphicCutter.generate(image, {
      difficulty: '4x4',
      seed: 'first-biomorphic-cut',
    });

    expect(layout.cutterId).toBe('biomorphic');
    expect(layout.cutDescriptor).toMatchObject({
      cutterId: 'biomorphic',
      version: 2,
      rows: 4,
      columns: 4,
    });
    expect(layout.cutDescriptor?.seed).toMatch(/^bio-[\da-f]{8}$/);
    expect(layout.cutDescriptor?.seed).not.toContain('secret');
    expect(layout.pieces).toHaveLength(16);
    expect(layout.pieces.map(({ id }) => id)).toEqual(
      Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4);
        const col = index % 4;
        return `biomorphic-${row}-${col}`;
      }),
    );
    expect(new Set(layout.pieces.map(({ neighborIds }) => neighborIds.length)).size).toBeGreaterThan(2);
    layout.pieces.forEach((piece) => {
      expect(piece.path).toContain('C');
      expect(piece.path.endsWith('Z')).toBe(true);
      piece.neighborIds.forEach((neighborId) => {
        expect(
          layout.pieces.find(({ id }) => id === neighborId)?.neighborIds,
        ).toContain(piece.id);
      });
    });
  }, 60_000);

  it('rebuilds identical normalized geometry from its descriptor after resize', async () => {
    const initial = await BiomorphicCutter.generate(image, {
      difficulty: '5x5',
      seed: 'rotation-stable-biomorph',
      boardMaxWidth: 320,
      boardMaxHeight: 240,
    });
    if (!initial.cutDescriptor) {
      throw new Error('Biomorphic layout did not include a cut descriptor');
    }

    const resized = await BiomorphicCutter.generate(image, {
      difficulty: '3x3',
      cutDescriptor: initial.cutDescriptor,
      boardMaxWidth: 700,
      boardMaxHeight: 440,
    });

    expect(resized.cutDescriptor).toEqual(initial.cutDescriptor);
    expect(resized.pieces.map(({ id }) => id)).toEqual(
      initial.pieces.map(({ id }) => id),
    );
    initial.pieces.forEach((piece, index) => {
      const resizedPiece = resized.pieces[index];
      const initialPath = normalizedPathNumbers(initial, index);
      const resizedPath = normalizedPathNumbers(resized, index);

      expect(resizedPiece.clipRegion).toEqual(piece.clipRegion);
      expect(resizedPiece.neighborIds).toEqual(piece.neighborIds);
      expect(resizedPath).toHaveLength(initialPath.length);
      resizedPath.forEach((coordinate, coordinateIndex) => {
        expect(coordinate).toBeCloseTo(initialPath[coordinateIndex], 5);
      });
      expect(resizedPiece.bounds.x / resized.boardSize.width).toBeCloseTo(
        piece.bounds.x / initial.boardSize.width,
        10,
      );
      expect(resizedPiece.bounds.y / resized.boardSize.height).toBeCloseTo(
        piece.bounds.y / initial.boardSize.height,
        10,
      );
      expect(resizedPiece.bounds.width / resized.boardSize.width).toBeCloseTo(
        piece.bounds.width / initial.boardSize.width,
        10,
      );
      expect(resizedPiece.bounds.height / resized.boardSize.height).toBeCloseTo(
        piece.bounds.height / initial.boardSize.height,
        10,
      );
    });
  }, 120_000);

  it('restores legacy v1 cuts and rejects descriptors from another plugin or version', async () => {
    const legacy = await BiomorphicCutter.generate(image, {
      difficulty: '3x3',
      cutDescriptor: {
        cutterId: 'biomorphic',
        version: 1,
        seed: 'bio-legacy',
        rows: 3,
        columns: 3,
      },
    });

    expect(legacy.cutDescriptor?.version).toBe(1);
    expect(legacy.pieces).toHaveLength(9);

    await expect(
      BiomorphicCutter.generate(image, {
        difficulty: '3x3',
        cutDescriptor: {
          cutterId: 'organic',
          version: 1,
          seed: 'org-seed',
          rows: 3,
          columns: 3,
        },
      }),
    ).rejects.toThrow('Cannot use a organic cut descriptor with Biomorphic');

    await expect(
      BiomorphicCutter.generate(image, {
        difficulty: '3x3',
        cutDescriptor: {
          cutterId: 'biomorphic',
          version: 99,
          seed: 'bio-seed',
          rows: 3,
          columns: 3,
        },
      }),
    ).rejects.toThrow('Unsupported Biomorphic cut descriptor version 99');
  });
});
