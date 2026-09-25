import {
  sampleBiomorphicPieceOutline,
  signedBiomorphicArea,
  type BiomorphicPoint,
  type BiomorphicTopology,
} from './generateBiomorphic';

/**
 * What a player would see go wrong with a cut, measured on the final curves
 * rather than on the simulation lattice.
 *
 * The lattice checks (connectivity, holes, `measureCutThickness`) run before
 * the seams are vectorised and smoothed, and smoothing is exactly where two
 * fingers that were a sample apart get drawn across each other. So this looks
 * at the curves the game will draw:
 *
 *  - a crossing, where two seams intersect anywhere but at the junction they
 *    share: the pieces overlap on screen;
 *  - a pinch, where one piece's outline comes back within `pinchGap` of
 *    itself after running a long way round: a neck or a finger squeezed by its
 *    neighbours, the "перехлёст" that reads as a mistake even when nothing
 *    actually crosses;
 *  - a piece whose area is far from the rest, which is where corners and
 *    borders went wrong before.
 */
export type CutAuditOptions = {
  /** Curve samples per cubic; the renderer's own density is plenty. */
  samplesPerCurve?: number;
  /** Narrowest acceptable gap, as a fraction of one grid cell's side. */
  pinchGap?: number;
  /** Area outside [min, max] of the ideal piece area is flagged. */
  areaRange?: readonly [number, number];
};

export type CutAudit = {
  crossings: BiomorphicPoint[];
  pinches: { piece: number; at: BiomorphicPoint; width: number }[];
  oddAreas: { piece: number; ratio: number }[];
  /** Narrowest gap found on each piece, as a fraction of a grid cell. */
  narrowestPerPiece: number[];
  /** Total area covered; anything but 1 means pieces overlap or leave gaps. */
  coverage: number;
  clean: boolean;
};

type Segment = { a: BiomorphicPoint; b: BiomorphicPoint; edge: number };

function sampleEdge(
  segments: BiomorphicTopology['edges'][number]['segments'],
  perCurve: number,
): BiomorphicPoint[] {
  const points: BiomorphicPoint[] = [segments[0].start];
  for (const segment of segments) {
    if (segment.kind === 'line') {
      points.push(segment.end);
      continue;
    }
    const { start: p0, control1: p1, control2: p2, end: p3 } = segment;
    for (let step = 1; step <= perCurve; step += 1) {
      const t = step / perCurve;
      const u = 1 - t;
      points.push({
        x:
          u * u * u * p0.x +
          3 * u * u * t * p1.x +
          3 * u * t * t * p2.x +
          t * t * t * p3.x,
        y:
          u * u * u * p0.y +
          3 * u * u * t * p1.y +
          3 * u * t * t * p2.y +
          t * t * t * p3.y,
      });
    }
  }
  return points;
}

function intersection(
  p: BiomorphicPoint,
  p2: BiomorphicPoint,
  q: BiomorphicPoint,
  q2: BiomorphicPoint,
): BiomorphicPoint | null {
  const rx = p2.x - p.x;
  const ry = p2.y - p.y;
  const sx = q2.x - q.x;
  const sy = q2.y - q.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-14) return null;
  const qpx = q.x - p.x;
  const qpy = q.y - p.y;
  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: p.x + t * rx, y: p.y + t * ry };
}

/** Uniform-grid buckets over the unit board. */
function bucketsFor<T>(
  items: readonly T[],
  bounds: (item: T) => [number, number, number, number],
  cell: number,
): Map<number, number[]> {
  const buckets = new Map<number, number[]>();
  const size = Math.ceil(1 / cell) + 2;
  items.forEach((item, index) => {
    const [minX, minY, maxX, maxY] = bounds(item);
    for (
      let bx = Math.floor(minX / cell);
      bx <= Math.floor(maxX / cell);
      bx += 1
    ) {
      for (
        let by = Math.floor(minY / cell);
        by <= Math.floor(maxY / cell);
        by += 1
      ) {
        const key = (by + 1) * size + (bx + 1);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index);
        else buckets.set(key, [index]);
      }
    }
  });
  return buckets;
}

function findCrossings(
  topology: BiomorphicTopology,
  perCurve: number,
): BiomorphicPoint[] {
  const segments: Segment[] = [];
  const junctions: BiomorphicPoint[] = [];
  topology.edges.forEach((edge, edgeIndex) => {
    const points = sampleEdge(edge.segments, perCurve);
    junctions.push(points[0], points[points.length - 1]);
    for (let index = 1; index < points.length; index += 1) {
      segments.push({ a: points[index - 1], b: points[index], edge: edgeIndex });
    }
  });
  const cell = 1 / (Math.max(topology.rows, topology.columns) * 8);
  const buckets = bucketsFor(
    segments,
    ({ a, b }) => [
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.max(a.x, b.x),
      Math.max(a.y, b.y),
    ],
    cell,
  );
  // Seams meet at junctions by design; a hit that close to one is the shared
  // endpoint seen through sampling, not a crossing.
  const junctionTolerance = cell * 0.25;
  const nearJunction = (point: BiomorphicPoint) =>
    junctions.some(
      (junction) =>
        Math.hypot(junction.x - point.x, junction.y - point.y) <
        junctionTolerance,
    );
  const seen = new Set<string>();
  const crossings: BiomorphicPoint[] = [];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const first = segments[bucket[i]];
        const second = segments[bucket[j]];
        // Consecutive samples of one seam share an endpoint.
        if (
          first.edge === second.edge &&
          Math.abs(bucket[i] - bucket[j]) <= 1
        ) {
          continue;
        }
        const key = `${Math.min(bucket[i], bucket[j])}:${Math.max(bucket[i], bucket[j])}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = intersection(first.a, first.b, second.a, second.b);
        if (hit && !nearJunction(hit)) crossings.push(hit);
      }
    }
  }
  return crossings;
}

/**
 * Narrowest place on one outline: two samples close in space but far apart
 * along the outline. The arc condition keeps an ordinary bend from counting:
 * a smooth curve is always close to its own neighbouring samples.
 */
function narrowestPinch(
  outline: readonly BiomorphicPoint[],
  cellSide: number,
): { width: number; at: BiomorphicPoint } {
  const count = outline.length;
  const arc = new Float64Array(count + 1);
  for (let index = 1; index <= count; index += 1) {
    const from = outline[index - 1];
    const to = outline[index % count];
    arc[index] = arc[index - 1] + Math.hypot(to.x - from.x, to.y - from.y);
  }
  const perimeter = arc[count];
  const probe = cellSide * 0.5;
  const buckets = bucketsFor(
    outline,
    ({ x, y }) => [x, y, x, y],
    probe,
  );
  const size = Math.ceil(1 / probe) + 2;
  let width = Infinity;
  let at: BiomorphicPoint = outline[0];
  outline.forEach((point, index) => {
    const bx = Math.floor(point.x / probe);
    const by = Math.floor(point.y / probe);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const bucket = buckets.get((by + dy + 1) * size + (bx + dx + 1));
        if (!bucket) continue;
        for (const other of bucket) {
          if (other <= index) continue;
          const distance = Math.hypot(
            outline[other].x - point.x,
            outline[other].y - point.y,
          );
          const along = Math.abs(arc[other] - arc[index]);
          const around = Math.min(along, perimeter - along);
          // Half a turn of a circle of this diameter is pi/2 * d; a neck is
          // anything that took far longer than that to come back.
          if (around > distance * 4 && distance < width) {
            width = distance;
            at = {
              x: (point.x + outline[other].x) / 2,
              y: (point.y + outline[other].y) / 2,
            };
          }
        }
      }
    }
  });
  return { width: width / cellSide, at };
}

export function auditCut(
  topology: BiomorphicTopology,
  {
    samplesPerCurve = 6,
    pinchGap = 0.06,
    areaRange = [0.35, 2.4],
  }: CutAuditOptions = {},
): CutAudit {
  const cellSide = Math.min(1 / topology.rows, 1 / topology.columns);
  const idealArea = 1 / topology.cells.length;
  const pinches: CutAudit['pinches'] = [];
  const oddAreas: CutAudit['oddAreas'] = [];
  const narrowestPerPiece: number[] = [];
  let coverage = 0;

  topology.cells.forEach((cell) => {
    const outline = sampleBiomorphicPieceOutline(
      topology,
      cell.index,
      samplesPerCurve,
    );
    const area = Math.abs(signedBiomorphicArea(outline));
    coverage += area;
    const ratio = area / idealArea;
    if (ratio < areaRange[0] || ratio > areaRange[1]) {
      oddAreas.push({ piece: cell.index, ratio });
    }
    const pinch = narrowestPinch(outline, cellSide);
    narrowestPerPiece.push(pinch.width);
    if (pinch.width < pinchGap) {
      pinches.push({ piece: cell.index, at: pinch.at, width: pinch.width });
    }
  });

  const crossings = findCrossings(topology, samplesPerCurve);
  return {
    crossings,
    pinches,
    oddAreas,
    narrowestPerPiece,
    coverage,
    clean:
      crossings.length === 0 &&
      pinches.length === 0 &&
      oddAreas.length === 0 &&
      Math.abs(coverage - 1) < 1e-3,
  };
}
