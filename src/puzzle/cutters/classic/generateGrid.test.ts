import { describe, expect, it } from 'vitest';

import { generateClassicGridPieces } from './generateGrid';

type Point = { x: number; y: number };
type Segment =
  | { kind: 'line'; start: Point; end: Point }
  | {
      kind: 'cubic';
      start: Point;
      control1: Point;
      control2: Point;
      end: Point;
    };

const NUMBER = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';

function parsePath(path: string): Segment[] {
  const tokens =
    path.match(new RegExp(`[MLCZ]|${NUMBER}`, 'gi')) ?? [];
  const segments: Segment[] = [];
  let index = 0;
  let current: Point | null = null;
  let start: Point | null = null;

  const point = (): Point => ({
    x: Number(tokens[index++]),
    y: Number(tokens[index++]),
  });

  while (index < tokens.length) {
    const command = tokens[index++].toUpperCase();
    if (command === 'M') {
      current = point();
      start = current;
    } else if (command === 'L') {
      if (!current) throw new Error('Line before move');
      const end = point();
      segments.push({ kind: 'line', start: current, end });
      current = end;
    } else if (command === 'C') {
      if (!current) throw new Error('Curve before move');
      const control1 = point();
      const control2 = point();
      const end = point();
      segments.push({ kind: 'cubic', start: current, control1, control2, end });
      current = end;
    } else if (command === 'Z') {
      if (!current || !start) throw new Error('Close before move');
      current = start;
    } else {
      throw new Error(`Unsupported path command ${command}`);
    }
  }

  return segments;
}

function close(left: Point, right: Point): boolean {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

function pieceEdges(
  path: string,
  row: number,
  column: number,
  rows: number,
  columns: number,
  width: number,
  height: number,
): Segment[][] {
  const left = (column * width) / columns;
  const right = ((column + 1) * width) / columns;
  const top = (row * height) / rows;
  const bottom = ((row + 1) * height) / rows;
  const edgeEnds: Point[] = [
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top },
  ];
  const edges: Segment[][] = [[], [], [], []];
  let edgeIndex = 0;

  parsePath(path).forEach((segment) => {
    edges[edgeIndex].push(segment);
    if (close(segment.end, edgeEnds[edgeIndex])) {
      edgeIndex += 1;
    }
  });

  expect(edgeIndex).toBe(4);
  return edges;
}

function cubicPoint(
  segment: Extract<Segment, { kind: 'cubic' }>,
  progress: number,
): Point {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * segment.start.x +
      3 * inverse ** 2 * progress * segment.control1.x +
      3 * inverse * progress ** 2 * segment.control2.x +
      progress ** 3 * segment.end.x,
    y:
      inverse ** 3 * segment.start.y +
      3 * inverse ** 2 * progress * segment.control1.y +
      3 * inverse * progress ** 2 * segment.control2.y +
      progress ** 3 * segment.end.y,
  };
}

function sample(segments: readonly Segment[]): Point[] {
  const points: Point[] = [segments[0].start];
  segments.forEach((segment) => {
    if (segment.kind === 'line') {
      points.push(segment.end);
      return;
    }
    for (let index = 1; index <= 8; index += 1) {
      points.push(cubicPoint(segment, index / 8));
    }
  });
  return points;
}

function expectReverseMatch(left: readonly Point[], right: readonly Point[]) {
  expect(left).toHaveLength(right.length);
  left.forEach((point, index) => {
    const opposite = right[right.length - 1 - index];
    expect(point.x).toBeCloseTo(opposite.x, 3);
    expect(point.y).toBeCloseTo(opposite.y, 3);
  });
}

describe('generateClassicGridPieces', () => {
  it.each([
    [3, 3, 320, 480],
    [4, 4, 640, 360],
    [5, 5, 413, 277],
  ])(
    'builds exact reciprocal seams for %sx%s on a %sx%s board',
    (rows, columns, width, height) => {
      const pieces = generateClassicGridPieces(rows, columns, width, height);
      const byCell = new Map(
        pieces.map((piece) => [`${piece.row}:${piece.col}`, piece]),
      );

      pieces.forEach((piece) => {
        const edges = pieceEdges(
          piece.path,
          piece.row,
          piece.col,
          rows,
          columns,
          width,
          height,
        );
        const right = byCell.get(`${piece.row}:${piece.col + 1}`);
        const below = byCell.get(`${piece.row + 1}:${piece.col}`);

        if (right) {
          const rightEdges = pieceEdges(
            right.path,
            right.row,
            right.col,
            rows,
            columns,
            width,
            height,
          );
          expectReverseMatch(sample(edges[1]), sample(rightEdges[3]));
        }
        if (below) {
          const belowEdges = pieceEdges(
            below.path,
            below.row,
            below.col,
            rows,
            columns,
            width,
            height,
          );
          expectReverseMatch(sample(edges[2]), sample(belowEdges[0]));
        }
      });
    },
  );

  it('keeps every curve inside its declared bounds and every neighbour reciprocal', () => {
    const width = 371;
    const height = 263;
    const pieces = generateClassicGridPieces(5, 5, width, height);
    const byId = new Map(pieces.map((piece) => [piece.id, piece]));

    pieces.forEach((piece) => {
      expect(piece.correctPosition).toEqual({
        x: piece.bounds.x,
        y: piece.bounds.y,
      });
      expect(piece.clipRegion.x).toBeCloseTo(piece.bounds.x / width, 12);
      expect(piece.clipRegion.y).toBeCloseTo(piece.bounds.y / height, 12);
      expect(piece.clipRegion.width).toBeCloseTo(piece.bounds.width / width, 12);
      expect(piece.clipRegion.height).toBeCloseTo(piece.bounds.height / height, 12);

      sample(parsePath(piece.path)).forEach((point) => {
        expect(point.x).toBeGreaterThanOrEqual(piece.bounds.x - 0.001);
        expect(point.x).toBeLessThanOrEqual(
          piece.bounds.x + piece.bounds.width + 0.001,
        );
        expect(point.y).toBeGreaterThanOrEqual(piece.bounds.y - 0.001);
        expect(point.y).toBeLessThanOrEqual(
          piece.bounds.y + piece.bounds.height + 0.001,
        );
      });

      piece.neighborIds.forEach((neighborId) => {
        expect(byId.get(neighborId)?.neighborIds).toContain(piece.id);
      });
    });
  });
});
