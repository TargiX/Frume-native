import { describe, expect, it } from 'vitest';

import { auditCut } from './auditCut';
import {
  createBiomorphicTopology,
  type BiomorphicEdge,
  type BiomorphicPoint,
  type BiomorphicTopology,
} from './generateBiomorphic';

function line(points: readonly BiomorphicPoint[]): BiomorphicEdge['segments'] {
  return points.slice(1).map((end, index) => ({
    kind: 'line' as const,
    start: points[index],
    end,
  }));
}

/**
 * A 1x2 board split by one seam from the top edge to the bottom edge, so each
 * case is a seam whose answer is known by construction.
 */
function splitBoard(seam: readonly BiomorphicPoint[]): BiomorphicTopology {
  const top = seam[0];
  const bottom = seam[seam.length - 1];
  const edge = (
    id: string,
    points: readonly BiomorphicPoint[],
    owners: string[],
  ): BiomorphicEdge => ({
    id,
    segments: line(points),
    ownerIds: owners,
    exterior: owners.length === 1,
  });
  const seamEdge = edge('seam', seam, ['left', 'right']);
  const leftEdges = [
    edge('lt', [{ x: 0, y: 0 }, top], ['left']),
    seamEdge,
    edge('lb', [bottom, { x: 0, y: 1 }], ['left']),
    edge('ll', [{ x: 0, y: 1 }, { x: 0, y: 0 }], ['left']),
  ];
  const rightEdges = [
    edge('rt', [top, { x: 1, y: 0 }], ['right']),
    edge('rr', [{ x: 1, y: 0 }, { x: 1, y: 1 }], ['right']),
    edge('rb', [{ x: 1, y: 1 }, bottom], ['right']),
    seamEdge,
  ];
  const cell = (
    id: string,
    index: number,
    edges: BiomorphicEdge[],
    seamDirection: 1 | -1,
  ) => ({
    id,
    index,
    row: 0,
    col: index,
    site: { x: index === 0 ? 0.25 : 0.75, y: 0.5 },
    vertices: [],
    edgeTraversals: edges.map((item) => ({
      edge: item,
      direction: item === seamEdge ? seamDirection : (1 as const),
    })),
    neighborIds: [index === 0 ? 'right' : 'left'],
  });
  return {
    rows: 1,
    columns: 2,
    cells: [cell('left', 0, leftEdges, 1), cell('right', 1, rightEdges, -1)],
    edges: [...leftEdges, ...rightEdges.filter((item) => item !== seamEdge)],
  };
}

describe('auditCut', () => {
  it('passes a straight seam', () => {
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings).toEqual([]);
    expect(audit.pinches).toEqual([]);
    expect(audit.coverage).toBeCloseTo(1, 6);
    expect(audit.clean).toBe(true);
  });

  it('finds a seam that loops back across itself', () => {
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 0.6 },
        { x: 0.7, y: 0.4 },
        { x: 0.3, y: 0.4 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings.length).toBeGreaterThan(0);
    expect(audit.clean).toBe(false);
  });

  it('finds a finger whose neck is thinner than the gap allowed', () => {
    // A finger of the left piece reaches into the right one through a neck
    // 0.02 wide, then opens into a head 0.2 across.
    const audit = auditCut(
      splitBoard([
        { x: 0.5, y: 0 },
        { x: 0.5, y: 0.45 },
        { x: 0.6, y: 0.45 },
        { x: 0.6, y: 0.35 },
        { x: 0.8, y: 0.35 },
        { x: 0.8, y: 0.57 },
        { x: 0.6, y: 0.57 },
        { x: 0.6, y: 0.47 },
        { x: 0.5, y: 0.47 },
        { x: 0.5, y: 1 },
      ]),
    );
    expect(audit.crossings).toEqual([]);
    expect(audit.pinches.length).toBeGreaterThan(0);
    // Cell side is 0.5, so a 0.02 neck is 0.04 of a cell.
    expect(Math.min(...audit.narrowestPerPiece)).toBeCloseTo(0.04, 2);
  });

  it('keeps a generated Voronoi cut clean', () => {
    const audit = auditCut(createBiomorphicTopology(4, 4, 'audit'));
    expect(audit.crossings).toEqual([]);
    expect(audit.coverage).toBeCloseTo(1, 3);
  });
});
