import { describe, expect, it } from 'vitest';

import {
  canonicalizeOrganicSeed,
  createOrganicTopology,
  generateOrganicPieces,
  getOrganicPieceEdgeTraversals,
  hasSelfIntersections,
  sampleOrganicPieceOutline,
  signedPolygonArea,
} from './generateOrganic';

type Point = {
  x: number;
  y: number;
};

function signedDistanceFromChord(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return (
    ((point.x - start.x) * -dy + (point.y - start.y) * dx) /
    Math.hypot(dx, dy)
  );
}

function edgePoints(
  outline: readonly Point[],
  edgeIndex: number,
  pointsPerEdge: number,
): Point[] {
  return Array.from(
    { length: pointsPerEdge + 1 },
    (_, index) =>
      outline[(edgeIndex * pointsPerEdge + index) % outline.length],
  );
}

function expectPointsToMatch(
  actual: readonly Point[],
  expected: readonly Point[],
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 12);
    expect(point.y).toBeCloseTo(expected[index].y, 12);
  });
}

describe('createOrganicTopology', () => {
  it('creates visibly irregular seams with three asymmetric alternating lobes', () => {
    const topology = createOrganicTopology(
      4,
      4,
      canonicalizeOrganicSeed('organic-shape'),
    );
    const interiorVertices = topology.vertices
      .slice(1, -1)
      .flatMap((row) => row.slice(1, -1));

    expect(
      interiorVertices.some(
        (point) =>
          Math.abs(point.x * topology.columns - Math.round(point.x * topology.columns)) >
            0.01 ||
          Math.abs(point.y * topology.rows - Math.round(point.y * topology.rows)) >
            0.01,
      ),
    ).toBe(true);
    const edge = topology.horizontalEdges[1][1];
    const start = edge.segments[0].start;
    const end = edge.segments[edge.segments.length - 1].end;
    const lobeOffsets = edge.segments
      .slice(0, -1)
      .map((segment) => signedDistanceFromChord(segment.end, start, end));

    expect(edge.segments).toHaveLength(4);
    expect(edge.segments.every(({ kind }) => kind === 'cubic')).toBe(true);
    expect(topology.verticalEdges[1][1].segments).toHaveLength(4);
    expect(
      topology.verticalEdges[1][1].segments.every(
        ({ kind }) => kind === 'cubic',
      ),
    ).toBe(true);
    lobeOffsets.forEach((offset) => {
      expect(Math.abs(offset)).toBeGreaterThan(0.015);
    });
    expect(Math.sign(lobeOffsets[0])).toBe(-Math.sign(lobeOffsets[1]));
    expect(Math.sign(lobeOffsets[1])).toBe(-Math.sign(lobeOffsets[2]));
    expect(
      new Set(lobeOffsets.map((offset) => Math.abs(offset).toFixed(5))).size,
    ).toBeGreaterThan(1);
  });

  it('keeps every exterior edge linear and exactly on the board perimeter', () => {
    const topology = createOrganicTopology(
      5,
      5,
      canonicalizeOrganicSeed('flat-perimeter'),
    );

    topology.horizontalEdges[0].forEach((edge) => {
      expect(edge.segments).toHaveLength(1);
      expect(edge.segments[0]).toMatchObject({ kind: 'line' });
      expect(edge.segments[0].start.y).toBe(0);
      expect(edge.segments[0].end.y).toBe(0);
    });
    topology.horizontalEdges[topology.rows].forEach((edge) => {
      expect(edge.segments).toHaveLength(1);
      expect(edge.segments[0]).toMatchObject({ kind: 'line' });
      expect(edge.segments[0].start.y).toBe(1);
      expect(edge.segments[0].end.y).toBe(1);
    });
    topology.verticalEdges.forEach((row) => {
      const left = row[0];
      const right = row[topology.columns];

      expect(left.segments).toHaveLength(1);
      expect(left.segments[0]).toMatchObject({ kind: 'line' });
      expect(left.segments[0].start.x).toBe(0);
      expect(left.segments[0].end.x).toBe(0);
      expect(right.segments).toHaveLength(1);
      expect(right.segments[0]).toMatchObject({ kind: 'line' });
      expect(right.segments[0].start.x).toBe(1);
      expect(right.segments[0].end.x).toBe(1);
    });
  });

  it('uses one shared edge and traverses every sampled point in exact reverse', () => {
    const topology = createOrganicTopology(
      4,
      4,
      canonicalizeOrganicSeed('shared-seams'),
    );
    const leftPiece = getOrganicPieceEdgeTraversals(topology, 1, 1);
    const rightPiece = getOrganicPieceEdgeTraversals(topology, 1, 2);
    const upperPiece = getOrganicPieceEdgeTraversals(topology, 1, 1);
    const lowerPiece = getOrganicPieceEdgeTraversals(topology, 2, 1);

    expect(leftPiece[1].edge).toBe(rightPiece[3].edge);
    expect(leftPiece[1].direction).toBe(1);
    expect(rightPiece[3].direction).toBe(-1);
    expect(upperPiece[2].edge).toBe(lowerPiece[0].edge);
    expect(upperPiece[2].direction).toBe(-1);
    expect(lowerPiece[0].direction).toBe(1);

    const samplesPerCurve = 4;
    const pointsPerEdge =
      topology.verticalEdges[1][2].segments.length * samplesPerCurve;
    const leftOutline = sampleOrganicPieceOutline(
      topology,
      1,
      1,
      samplesPerCurve,
    );
    const rightOutline = sampleOrganicPieceOutline(
      topology,
      1,
      2,
      samplesPerCurve,
    );
    const upperOutline = sampleOrganicPieceOutline(
      topology,
      1,
      1,
      samplesPerCurve,
    );
    const lowerOutline = sampleOrganicPieceOutline(
      topology,
      2,
      1,
      samplesPerCurve,
    );
    const leftSharedEdge = edgePoints(leftOutline, 1, pointsPerEdge);
    const rightSharedEdge = edgePoints(rightOutline, 3, pointsPerEdge);
    const upperSharedEdge = edgePoints(upperOutline, 2, pointsPerEdge);
    const lowerSharedEdge = edgePoints(lowerOutline, 0, pointsPerEdge);

    expectPointsToMatch(leftSharedEdge, [...rightSharedEdge].reverse());
    expectPointsToMatch(upperSharedEdge, [...lowerSharedEdge].reverse());
  });

  it.each([
    ['easy portrait', 3, 3, 320, 480],
    ['medium landscape', 4, 4, 640, 360],
    ['hard square', 5, 5, 500, 500],
  ])(
    'returns exact bounds containing every outline for %s',
    (seedName, rows, columns, width, height) => {
      const seed = canonicalizeOrganicSeed(`bounds-${seedName}`);
      const topology = createOrganicTopology(rows, columns, seed);
      const pieces = generateOrganicPieces(
        rows,
        columns,
        width,
        height,
        seed,
      );

      pieces.forEach((piece) => {
        const outline = sampleOrganicPieceOutline(
          topology,
          piece.row,
          piece.col,
        );
        const right = piece.clipRegion.x + piece.clipRegion.width;
        const bottom = piece.clipRegion.y + piece.clipRegion.height;

        outline.forEach((point) => {
          expect(point.x).toBeGreaterThanOrEqual(piece.clipRegion.x - 1e-8);
          expect(point.x).toBeLessThanOrEqual(right + 1e-8);
          expect(point.y).toBeGreaterThanOrEqual(piece.clipRegion.y - 1e-8);
          expect(point.y).toBeLessThanOrEqual(bottom + 1e-8);
        });
        expect(piece.correctPosition).toEqual({
          x: piece.bounds.x,
          y: piece.bounds.y,
        });
      });
    },
  );

  it.each([
    ['easy seed', 3, 3],
    ['medium seed', 4, 4],
    ['hard seed', 5, 5],
    ['adversarial-a', 5, 5],
    ['adversarial-b', 5, 5],
  ])('returns simple pieces without slivers for %s', (seed, rows, columns) => {
    const topology = createOrganicTopology(
      rows,
      columns,
      canonicalizeOrganicSeed(seed),
    );
    let totalArea = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const outline = sampleOrganicPieceOutline(topology, row, column);
        const area = Math.abs(signedPolygonArea(outline));

        expect(hasSelfIntersections(outline)).toBe(false);
        expect(area).toBeGreaterThan((1 / (rows * columns)) * 0.42);
        totalArea += area;
      }
    }

    expect(totalArea).toBeCloseTo(1, 5);
  });

  it('keeps broad 3x3, 4x4, and 5x5 seed samples inside the safety contract', () => {
    for (let index = 0; index < 72; index += 1) {
      const size = 3 + (index % 3);
      const topology = createOrganicTopology(
        size,
        size,
        canonicalizeOrganicSeed(`safety-sweep-${index}`),
      );
      const idealArea = 1 / (size * size);
      let totalArea = 0;

      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          const outline = sampleOrganicPieceOutline(topology, row, column);
          const xs = outline.map(({ x }) => x);
          const ys = outline.map(({ y }) => y);
          const area = Math.abs(signedPolygonArea(outline));

          expect(hasSelfIntersections(outline)).toBe(false);
          expect(area).toBeGreaterThan(idealArea * 0.42);
          expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
            (1 / size) * 0.42,
          );
          expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
            (1 / size) * 0.42,
          );
          totalArea += area;
        }
      }

      expect(totalArea).toBeCloseTo(1, 5);
    }
  });
});
