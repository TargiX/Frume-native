import {
  type BiomorphicPoint,
  type BiomorphicTopology,
} from "./generateBiomorphic";
import { curveThroughPoints } from "./generateBiomorphicPhaseField";

/**
 * Storage format for a pre-generated cut.
 *
 * A cut cannot be produced on the device -- a 5x5 Amoeba board takes about a
 * hundred seconds on a laptop -- so every cut ships baked, and the only real
 * question is how much room the library takes.
 *
 * Two things make it small. A cubic's control points are a fixed function of
 * its neighbours and the tension, so they are recomputed on load rather than
 * stored; and coordinates live on the unit board, where 16-bit fixed point is
 * finer than a hundredth of a sample at any resolution worth baking. Together
 * they take a 5x5 cut from 190 KB of gzipped JSON to 12 KB, which turns the
 * library from a download into a handful of files in the bundle.
 */

/** Bumped whenever the payload layout changes. */
export const BAKED_CUT_VERSION = 1;

export type BakedCut = {
  version: number;
  rows: number;
  columns: number;
  /** Catmull-Rom tension the curve was built with, so it rebuilds identically. */
  tension: number;
  edges: readonly {
    id: string;
    ownerIds: readonly string[];
    exterior: boolean;
    /** Number of points this edge takes from the shared coordinate blob. */
    pointCount: number;
  }[];
  cells: readonly {
    id: string;
    index: number;
    row: number;
    col: number;
    neighborIds: readonly string[];
    /** Edge index and direction, in outline order. */
    traversals: readonly [number, 1 | -1][];
    /** Number of Voronoi polygon vertices taken from the blob. */
    vertexCount: number;
  }[];
  /** Base64 of a Uint16 stream: every edge's points, then every cell's site and vertices. */
  points: string;
};

const SCALE = 65535;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

/** Points of an edge: the first segment's start, then every segment's end. */
function edgePoints(
  segments: BiomorphicTopology["edges"][number]["segments"],
): BiomorphicPoint[] {
  if (segments.length === 0) return [];
  const points: BiomorphicPoint[] = [segments[0].start];
  for (const segment of segments) points.push(segment.end);
  return points;
}

export function encodeBakedCut(
  topology: BiomorphicTopology,
  tension = 0.52,
): BakedCut {
  const edgeIndexById = new Map<string, number>();
  topology.edges.forEach((edge, index) => edgeIndexById.set(edge.id, index));

  const coordinates: number[] = [];
  const push = (point: BiomorphicPoint) => {
    coordinates.push(
      Math.max(0, Math.min(SCALE, Math.round(point.x * SCALE))),
      Math.max(0, Math.min(SCALE, Math.round(point.y * SCALE))),
    );
  };

  const edges = topology.edges.map((edge) => {
    const points = edgePoints(edge.segments);
    points.forEach(push);
    return {
      id: edge.id,
      ownerIds: [...edge.ownerIds],
      exterior: edge.exterior,
      pointCount: points.length,
    };
  });

  const cells = topology.cells.map((cell) => {
    push(cell.site);
    cell.vertices.forEach(push);
    return {
      id: cell.id,
      index: cell.index,
      row: cell.row,
      col: cell.col,
      neighborIds: [...cell.neighborIds],
      traversals: cell.edgeTraversals.map(({ edge, direction }) => {
        const index = edgeIndexById.get(edge.id);
        if (index === undefined) {
          throw new Error(`Cell ${cell.id} traverses an edge outside the cut`);
        }
        return [index, direction] as [number, 1 | -1];
      }),
      vertexCount: cell.vertices.length,
    };
  });

  const bytes = new Uint8Array(coordinates.length * 2);
  const view = new DataView(bytes.buffer);
  coordinates.forEach((value, index) => view.setUint16(index * 2, value, true));

  return {
    version: BAKED_CUT_VERSION,
    rows: topology.rows,
    columns: topology.columns,
    tension,
    edges,
    cells,
    points: toBase64(bytes),
  };
}

/**
 * Quarter turns clockwise on the unit board.
 *
 * Turning a cut is free variety: one baked entry serves four boards, and the
 * styles whose tips prefer a heading -- the crystals -- look most different of
 * all when turned. Rotation keeps handedness, so every outline still winds the
 * way it was built; mirroring would not, which is why it is not offered here.
 */
export type BakedCutQuarterTurns = 0 | 1 | 2 | 3;

function turnPoint(
  point: BiomorphicPoint,
  turns: BakedCutQuarterTurns,
): BiomorphicPoint {
  switch (turns) {
    case 1:
      return { x: 1 - point.y, y: point.x };
    case 2:
      return { x: 1 - point.x, y: 1 - point.y };
    case 3:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

/** The grid coordinate the same cell occupies after the board is turned. */
function turnCell(
  row: number,
  col: number,
  rows: number,
  columns: number,
  turns: BakedCutQuarterTurns,
): { row: number; col: number } {
  switch (turns) {
    case 1:
      return { row: col, col: rows - 1 - row };
    case 2:
      return { row: rows - 1 - row, col: columns - 1 - col };
    case 3:
      return { row: columns - 1 - col, col: row };
    default:
      return { row, col };
  }
}

export function decodeBakedCut(
  baked: BakedCut,
  turns: BakedCutQuarterTurns = 0,
): BiomorphicTopology {
  if (baked.version !== BAKED_CUT_VERSION) {
    throw new Error(`Unsupported baked cut version ${baked.version}`);
  }
  if ((turns === 1 || turns === 3) && baked.rows !== baked.columns) {
    // A quarter turn of an oblong board swaps rows and columns, which would
    // no longer match the grid the caller asked for.
    throw new Error(
      `Cannot quarter-turn a ${baked.rows}x${baked.columns} baked cut`,
    );
  }
  const bytes = fromBase64(baked.points);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  const take = (): BiomorphicPoint => {
    const x = view.getUint16(cursor * 2, true) / SCALE;
    const y = view.getUint16((cursor + 1) * 2, true) / SCALE;
    cursor += 2;
    return turnPoint({ x, y }, turns);
  };

  const edges = baked.edges.map((edge) => {
    const points: BiomorphicPoint[] = [];
    for (let index = 0; index < edge.pointCount; index += 1) points.push(take());
    return {
      id: edge.id,
      ownerIds: edge.ownerIds,
      exterior: edge.exterior,
      // The board frame is straight, so a perimeter edge is one line however
      // many points it carries.
      segments: edge.exterior
        ? [
            {
              kind: "line" as const,
              start: points[0],
              end: points[points.length - 1],
            },
          ]
        : curveThroughPoints(points, baked.tension),
    };
  });

  const cells = baked.cells.map((cell) => {
    const site = take();
    const vertices: BiomorphicPoint[] = [];
    for (let index = 0; index < cell.vertexCount; index += 1) {
      vertices.push(take());
    }
    const turned = turnCell(
      cell.row,
      cell.col,
      baked.rows,
      baked.columns,
      turns,
    );
    return {
      id: cell.id,
      index: cell.index,
      row: turned.row,
      col: turned.col,
      site,
      vertices,
      neighborIds: cell.neighborIds,
      edgeTraversals: cell.traversals.map(([edgeIndex, direction]) => ({
        edge: edges[edgeIndex],
        direction,
      })),
    };
  });

  return { rows: baked.rows, columns: baked.columns, cells, edges };
}
