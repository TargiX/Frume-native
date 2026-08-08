import { describe, expect, it } from 'vitest';

import type { PuzzleLayout } from '../../types/layout';
import { getCutter, listCutters } from '../registry';
import { OrganicCutter } from './OrganicCutter';

const image = {
  uri: 'https://images.example/puzzle.jpg',
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

describe('OrganicCutter', () => {
  it('identifies itself and is registered separately from Classic', () => {
    expect(OrganicCutter.meta.id).toBe('organic');
    expect(getCutter('organic')).toBe(OrganicCutter);
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

  it('creates stable IDs, neighbor relationships, and organic SVG paths', async () => {
    const layout = await OrganicCutter.generate(image, {
      difficulty: 'easy',
      seed: 'first-paid-cut',
    });

    expect(layout.cutterId).toBe('organic');
    expect(layout.cutDescriptor).toMatchObject({
      cutterId: 'organic',
      version: 1,
      rows: 3,
      columns: 3,
    });
    expect(layout.pieces).toHaveLength(9);
    expect(layout.pieces.map(({ id }) => id)).toEqual([
      'organic-0-0',
      'organic-0-1',
      'organic-0-2',
      'organic-1-0',
      'organic-1-1',
      'organic-1-2',
      'organic-2-0',
      'organic-2-1',
      'organic-2-2',
    ]);
    expect(layout.pieces[4].neighborIds).toEqual([
      'organic-0-1',
      'organic-2-1',
      'organic-1-0',
      'organic-1-2',
    ]);
    expect(layout.pieces[4].path).toContain('C');
  });

  it('rebuilds the same normalized geometry from its cut descriptor after resize', async () => {
    const initial = await OrganicCutter.generate(image, {
      difficulty: 'hard',
      seed: 'rotation-safe',
      boardMaxWidth: 320,
      boardMaxHeight: 240,
    });
    if (!initial.cutDescriptor) {
      throw new Error('Organic layout did not include a cut descriptor');
    }

    const resized = await OrganicCutter.generate(image, {
      difficulty: 'easy',
      cutDescriptor: initial.cutDescriptor,
      boardMaxWidth: 640,
      boardMaxHeight: 420,
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
  });

  it('uses a deterministic default seed that is independent of board size', async () => {
    const first = await OrganicCutter.generate(image, {
      difficulty: 'medium',
      boardMaxWidth: 300,
      boardMaxHeight: 240,
    });
    const second = await OrganicCutter.generate(image, {
      difficulty: 'medium',
      boardMaxWidth: 600,
      boardMaxHeight: 480,
    });

    expect(second.cutDescriptor).toEqual(first.cutDescriptor);
    first.pieces.forEach((_, index) => {
      const firstPath = normalizedPathNumbers(first, index);
      const secondPath = normalizedPathNumbers(second, index);

      secondPath.forEach((coordinate, coordinateIndex) => {
        expect(coordinate).toBeCloseTo(firstPath[coordinateIndex], 5);
      });
    });
  });
});
