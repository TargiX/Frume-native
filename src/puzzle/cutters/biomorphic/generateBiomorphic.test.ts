import { describe, expect, it } from 'vitest';

import {
  canonicalizeBiomorphicSeed,
  createBiomorphicTopology,
  generateBiomorphicPieces,
  hasBiomorphicSelfIntersections,
  sampleBiomorphicEdge,
  sampleBiomorphicPieceOutline,
  signedBiomorphicArea,
} from './generateBiomorphic';

function topologyRecipe(seed: string) {
  const topology = createBiomorphicTopology(5, 5, seed);
  return {
    cells: topology.cells.map((cell) => ({
      id: cell.id,
      site: cell.site,
      vertices: cell.vertices,
      neighbors: cell.neighborIds,
      edgeIds: cell.edgeTraversals.map(({ edge, direction }) => ({
        id: edge.id,
        direction,
      })),
    })),
    edges: topology.edges.map((edge) => ({
      id: edge.id,
      exterior: edge.exterior,
      owners: edge.ownerIds,
      segments: edge.segments,
    })),
  };
}

describe('createBiomorphicTopology', () => {
  it('is deterministic for an equal seed and changes for a different seed', () => {
    const firstSeed = canonicalizeBiomorphicSeed('repeatable-life-form');
    const secondSeed = canonicalizeBiomorphicSeed('another-life-form');

    expect(topologyRecipe(firstSeed)).toEqual(topologyRecipe(firstSeed));
    expect(topologyRecipe(secondSeed)).not.toEqual(topologyRecipe(firstSeed));
  });

  it('uses genuinely non-grid Voronoi adjacency with variable neighbor counts', () => {
    const topology = createBiomorphicTopology(
      5,
      5,
      canonicalizeBiomorphicSeed('variable-cell-neighbors'),
    );
    const degrees = topology.cells.map(({ neighborIds }) => neighborIds.length);
    const interiorDegrees = topology.cells
      .filter(
        ({ row, col }) =>
          row > 0 && row < topology.rows - 1 && col > 0 && col < topology.columns - 1,
      )
      .map(({ neighborIds }) => neighborIds.length);

    expect(new Set(degrees).size).toBeGreaterThanOrEqual(4);
    expect(interiorDegrees.some((degree) => degree !== 4)).toBe(true);
    expect(Math.max(...degrees)).toBeGreaterThanOrEqual(5);
  });

  it('builds each internal seam once and traverses it in exact reverse', () => {
    const topology = createBiomorphicTopology(
      4,
      4,
      canonicalizeBiomorphicSeed('one-seam-two-owners'),
    );

    topology.edges
      .filter(({ exterior }) => !exterior)
      .forEach((edge) => {
        expect(edge.ownerIds).toHaveLength(2);
        const [firstOwner, secondOwner] = edge.ownerIds;
        const firstCell = topology.cells.find(({ id }) => id === firstOwner)!;
        const secondCell = topology.cells.find(({ id }) => id === secondOwner)!;
        const firstTraversal = firstCell.edgeTraversals.find(
          ({ edge: candidate }) => candidate === edge,
        )!;
        const secondTraversal = secondCell.edgeTraversals.find(
          ({ edge: candidate }) => candidate === edge,
        )!;

        expect(firstTraversal.direction).toBe(-secondTraversal.direction);
        expect(firstCell.neighborIds).toContain(secondOwner);
        expect(secondCell.neighborIds).toContain(firstOwner);

        const forward = sampleBiomorphicEdge(edge, 1, 5);
        const reverse = sampleBiomorphicEdge(edge, -1, 5).reverse();
        expect(reverse).toHaveLength(forward.length);
        forward.forEach((point, index) => {
          expect(reverse[index].x).toBeCloseTo(point.x, 14);
          expect(reverse[index].y).toBeCloseTo(point.y, 14);
        });
      });
  });

  it('keeps the exterior linear and exactly on the four board edges', () => {
    const topology = createBiomorphicTopology(
      5,
      5,
      canonicalizeBiomorphicSeed('exact-square-perimeter'),
    );

    topology.edges
      .filter(({ exterior }) => exterior)
      .forEach((edge) => {
        expect(edge.ownerIds).toHaveLength(1);
        expect(edge.segments).toHaveLength(1);
        const segment = edge.segments[0];
        expect(segment.kind).toBe('line');
        const { start, end } = segment;
        expect(
          (start.x === 0 && end.x === 0) ||
            (start.x === 1 && end.x === 1) ||
            (start.y === 0 && end.y === 0) ||
            (start.y === 1 && end.y === 1),
        ).toBe(true);
      });
    const perimeterLength = topology.edges
      .filter(({ exterior }) => exterior)
      .reduce((total, { segments }) => {
        const { start, end } = segments[0];
        return total + Math.hypot(end.x - start.x, end.y - start.y);
      }, 0);
    expect(perimeterLength).toBeCloseTo(4, 9);
  });

  it('gives representative internal seams three asymmetric flowing lobes', () => {
    const topology = createBiomorphicTopology(
      4,
      4,
      canonicalizeBiomorphicSeed('visible-biomorphic-seams'),
    );
    const curvedEdges = topology.edges.filter(
      ({ exterior, segments }) =>
        !exterior &&
        segments.length === 4 &&
        segments.every(({ kind }) => kind === 'cubic'),
    );

    expect(curvedEdges.length).toBeGreaterThan(topology.cells.length / 2);
  });

  it('keeps a broad seed matrix simple, substantial, and gap-free', () => {
    for (let index = 0; index < 45; index += 1) {
      const size = 3 + (index % 3);
      const topology = createBiomorphicTopology(
        size,
        size,
        canonicalizeBiomorphicSeed(`biomorphic-safety-${index}`),
      );
      const idealArea = 1 / topology.cells.length;
      let totalArea = 0;

      topology.cells.forEach((cell) => {
        const outline = sampleBiomorphicPieceOutline(topology, cell.index);
        const area = signedBiomorphicArea(outline);
        const xs = outline.map(({ x }) => x);
        const ys = outline.map(({ y }) => y);

        expect(hasBiomorphicSelfIntersections(outline)).toBe(false);
        expect(area).toBeGreaterThan(idealArea * 0.32);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
          (1 / size) * 0.28,
        );
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(
          (1 / size) * 0.28,
        );
        outline.forEach(({ x, y }) => {
          expect(x).toBeGreaterThanOrEqual(-1e-9);
          expect(x).toBeLessThanOrEqual(1 + 1e-9);
          expect(y).toBeGreaterThanOrEqual(-1e-9);
          expect(y).toBeLessThanOrEqual(1 + 1e-9);
        });
        totalArea += area;
      });

      expect(totalArea).toBeCloseTo(1, 6);
    }
  });
});

describe('generateBiomorphicPieces', () => {
  it('keeps AABBs tray-friendly across board aspect ratios and seed samples', () => {
    for (const size of [3, 4, 5]) {
      for (let seedIndex = 0; seedIndex < 16; seedIndex += 1) {
        for (const boardAspect of [9 / 16, 1, 16 / 9]) {
          const height = 600;
          const width = height * boardAspect;
          const pieces = generateBiomorphicPieces(
            size,
            size,
            width,
            height,
            canonicalizeBiomorphicSeed(`aabb-${size}-${seedIndex}`),
          );
          pieces.forEach(({ bounds }) => {
            // The tray sizes every slot from the largest AABB. Keeping either
            // axis below 1.75 ideal cells prevents one unusual Voronoi piece
            // from shrinking the whole tray into tiny thumbnails.
            expect((bounds.width / width) * size).toBeLessThan(1.75);
            expect((bounds.height / height) * size).toBeLessThan(1.75);
            expect(
              Math.max(
                bounds.width / bounds.height,
                bounds.height / bounds.width,
              ),
            ).toBeLessThan(4);
          });
        }
      }
    }
  });

  it('returns exact bounds containing every curved outline', () => {
    const rows = 5;
    const columns = 5;
    const width = 640;
    const height = 360;
    const seed = canonicalizeBiomorphicSeed('bounds-and-origin');
    const topology = createBiomorphicTopology(rows, columns, seed);
    const pieces = generateBiomorphicPieces(
      rows,
      columns,
      width,
      height,
      seed,
    );

    pieces.forEach((piece) => {
      const outline = sampleBiomorphicPieceOutline(topology, piece.index);
      const right = piece.clipRegion.x + piece.clipRegion.width;
      const bottom = piece.clipRegion.y + piece.clipRegion.height;

      outline.forEach(({ x, y }) => {
        expect(x).toBeGreaterThanOrEqual(piece.clipRegion.x - 1e-8);
        expect(x).toBeLessThanOrEqual(right + 1e-8);
        expect(y).toBeGreaterThanOrEqual(piece.clipRegion.y - 1e-8);
        expect(y).toBeLessThanOrEqual(bottom + 1e-8);
      });
      expect(piece.correctPosition).toEqual({
        x: piece.bounds.x,
        y: piece.bounds.y,
      });
      expect(piece.bounds).toEqual({
        x: piece.clipRegion.x * width,
        y: piece.clipRegion.y * height,
        width: piece.clipRegion.width * width,
        height: piece.clipRegion.height * height,
      });
      expect(piece.path.startsWith('M ')).toBe(true);
      expect(piece.path.endsWith('Z')).toBe(true);
    });
  });

  it('rejects invalid board dimensions', () => {
    expect(() =>
      generateBiomorphicPieces(3, 3, 0, 320, 'invalid-board'),
    ).toThrow('Biomorphic cutter board dimensions must be positive');
  });
});
