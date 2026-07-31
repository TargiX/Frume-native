import type { Rect } from '../../types/geometry';
import type { PuzzlePieceDefinition } from '../../types/layout';

export type BiomorphicPoint = {
  x: number;
  y: number;
};

export type BiomorphicPathSegment =
  | {
      kind: 'line';
      start: BiomorphicPoint;
      end: BiomorphicPoint;
    }
  | {
      kind: 'cubic';
      start: BiomorphicPoint;
      control1: BiomorphicPoint;
      control2: BiomorphicPoint;
      end: BiomorphicPoint;
    };

export type BiomorphicEdge = {
  id: string;
  segments: readonly BiomorphicPathSegment[];
  /** One owner for the perimeter, two owners for an internal shared seam. */
  ownerIds: readonly string[];
  exterior: boolean;
};

export type BiomorphicEdgeTraversal = {
  edge: BiomorphicEdge;
  direction: 1 | -1;
};

export type BiomorphicCell = {
  id: string;
  index: number;
  row: number;
  col: number;
  site: BiomorphicPoint;
  /** Straight Voronoi polygon before its shared edges receive flowing lobes. */
  vertices: readonly BiomorphicPoint[];
  edgeTraversals: readonly BiomorphicEdgeTraversal[];
  neighborIds: readonly string[];
};

export type BiomorphicTopology = {
  rows: number;
  columns: number;
  cells: readonly BiomorphicCell[];
  edges: readonly BiomorphicEdge[];
};

type SeedSite = BiomorphicPoint & {
  id: string;
  index: number;
  row: number;
  col: number;
};

type RawCell = SeedSite & {
  vertices: BiomorphicPoint[];
};

type EdgeUse = {
  cellIndex: number;
  start: BiomorphicPoint;
  end: BiomorphicPoint;
};

type EdgeRecord = {
  start: BiomorphicPoint;
  end: BiomorphicPoint;
  uses: EdgeUse[];
};

const EPSILON = 1e-9;
const POINT_PRECISION = 1e9;
const SAMPLES_PER_CURVE = 12;
const SITE_VARIATION_ATTEMPTS = [1, 0.72, 0.42, 0] as const;
const CURVE_VARIATION_ATTEMPTS = [1, 0.72, 0.45, 0.22, 0] as const;

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

function randomUnit(seed: string, key: string): number {
  return hashString(`${seed}:${key}`) / 0x100000000;
}

function randomSigned(seed: string, key: string): number {
  return randomUnit(seed, key) * 2 - 1;
}

/**
 * Stores a short stable recipe instead of persisting a photo URL, which may
 * contain signed query parameters or other private source information.
 */
export function canonicalizeBiomorphicSeed(seed: string | number): string {
  return `bio-${hashString(String(seed)).toString(16).padStart(8, '0')}`;
}

function assertDimensions(rows: number, columns: number): void {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1
  ) {
    throw new Error(
      'Biomorphic cutter rows and columns must be positive integers',
    );
  }
}

function pointDistance(first: BiomorphicPoint, second: BiomorphicPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointEquals(first: BiomorphicPoint, second: BiomorphicPoint): boolean {
  return (
    Math.abs(first.x - second.x) <= EPSILON &&
    Math.abs(first.y - second.y) <= EPSILON
  );
}

function cleanCoordinate(value: number): number {
  if (Math.abs(value) <= EPSILON) return 0;
  if (Math.abs(value - 1) <= EPSILON) return 1;
  return Math.round(value * POINT_PRECISION) / POINT_PRECISION;
}

function canonicalPoint(point: BiomorphicPoint): BiomorphicPoint {
  return {
    x: cleanCoordinate(point.x),
    y: cleanCoordinate(point.y),
  };
}

function pointKey(point: BiomorphicPoint): string {
  return `${point.x.toFixed(9)},${point.y.toFixed(9)}`;
}

function edgeKey(start: BiomorphicPoint, end: BiomorphicPoint): string {
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  return startKey < endKey
    ? `${startKey}|${endKey}`
    : `${endKey}|${startKey}`;
}

function cleanPolygon(
  points: readonly BiomorphicPoint[],
  canonicalize = false,
): BiomorphicPoint[] {
  const deduplicated: BiomorphicPoint[] = [];

  points
    .map((point) => (canonicalize ? canonicalPoint(point) : point))
    .forEach((point) => {
      const previous = deduplicated[deduplicated.length - 1];
      if (!previous || !pointEquals(point, previous)) {
        deduplicated.push(point);
      }
    });

  if (
    deduplicated.length > 1 &&
    pointEquals(deduplicated[0], deduplicated[deduplicated.length - 1])
  ) {
    deduplicated.pop();
  }

  let changed = true;
  while (changed && deduplicated.length > 3) {
    changed = false;
    for (let index = 0; index < deduplicated.length; index += 1) {
      const previous = deduplicated[
        (index - 1 + deduplicated.length) % deduplicated.length
      ];
      const current = deduplicated[index];
      const next = deduplicated[(index + 1) % deduplicated.length];
      const cross =
        (current.x - previous.x) * (next.y - current.y) -
        (current.y - previous.y) * (next.x - current.x);

      if (
        Math.abs(cross) <= EPSILON &&
        pointDistance(previous, current) + pointDistance(current, next) <=
          pointDistance(previous, next) + EPSILON
      ) {
        deduplicated.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return deduplicated;
}

function clipPolygonToSite(
  polygon: readonly BiomorphicPoint[],
  site: BiomorphicPoint,
  other: BiomorphicPoint,
): BiomorphicPoint[] {
  const normalX = other.x - site.x;
  const normalY = other.y - site.y;
  const limit =
    (other.x * other.x +
      other.y * other.y -
      site.x * site.x -
      site.y * site.y) /
    2;
  const signedDistance = (point: BiomorphicPoint): number =>
    point.x * normalX + point.y * normalY - limit;
  const result: BiomorphicPoint[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startDistance = signedDistance(start);
    const endDistance = signedDistance(end);
    const startInside = startDistance <= EPSILON;
    const endInside = endDistance <= EPSILON;

    if (startInside) {
      result.push(start);
    }

    if (startInside !== endInside) {
      const denominator = startDistance - endDistance;
      const progress =
        Math.abs(denominator) <= EPSILON ? 0.5 : startDistance / denominator;
      result.push({
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      });
    }
  }

  return cleanPolygon(result);
}

function voronoiPolygon(
  site: SeedSite,
  sites: readonly SeedSite[],
): BiomorphicPoint[] {
  let polygon: BiomorphicPoint[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  for (const other of sites) {
    if (other.index === site.index) continue;
    polygon = clipPolygonToSite(polygon, site, other);
    if (polygon.length < 3) break;
  }

  return cleanPolygon(polygon, true);
}

function polygonCentroid(points: readonly BiomorphicPoint[]): BiomorphicPoint {
  const area = signedBiomorphicArea(points);
  if (Math.abs(area) <= EPSILON) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.y - next.x * point.y;
    weightedX += (point.x + next.x) * cross;
    weightedY += (point.y + next.y) * cross;
  }

  return {
    x: weightedX / (6 * area),
    y: weightedY / (6 * area),
  };
}

function createSites(
  rows: number,
  columns: number,
  seed: string,
  variation: number,
): SeedSite[] {
  const jitter = 0.32 * variation;
  const sites = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      id: `biomorphic-${row}-${col}`,
      index,
      row,
      col,
      x:
        (col + 0.5 + randomSigned(seed, `site-x-${row}-${col}`) * jitter) /
        columns,
      y:
        (row + 0.5 + randomSigned(seed, `site-y-${row}-${col}`) * jitter) /
        rows,
    };
  });

  // One conservative Lloyd relaxation evens out accidental skinny cells while
  // retaining the seeded, non-grid topology. The clamp keeps stable row/column
  // identity useful to accessibility labels and saved sessions.
  const initialPolygons = sites.map((site) => voronoiPolygon(site, sites));
  return sites.map((site, index) => {
    const centroid = polygonCentroid(initialPolygons[index]);
    const blend = 0.32;
    const minX = (site.col + 0.12) / columns;
    const maxX = (site.col + 0.88) / columns;
    const minY = (site.row + 0.12) / rows;
    const maxY = (site.row + 0.88) / rows;

    return {
      ...site,
      x: Math.min(maxX, Math.max(minX, site.x * (1 - blend) + centroid.x * blend)),
      y: Math.min(maxY, Math.max(minY, site.y * (1 - blend) + centroid.y * blend)),
    };
  });
}

function createRawCells(
  rows: number,
  columns: number,
  seed: string,
  variation: number,
): RawCell[] {
  const sites = createSites(rows, columns, seed, variation);
  return sites.map((site) => ({
    ...site,
    vertices: voronoiPolygon(site, sites),
  }));
}

function lineSegments(
  start: BiomorphicPoint,
  end: BiomorphicPoint,
): BiomorphicPathSegment[] {
  return [{ kind: 'line', start, end }];
}

function curvedSegments(
  edgeId: string,
  start: BiomorphicPoint,
  end: BiomorphicPoint,
  seed: string,
  cellScale: number,
  variation: number,
): BiomorphicPathSegment[] {
  if (variation === 0) return lineSegments(start, end);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return lineSegments(start, end);

  const normalX = -dy / length;
  const normalY = dx / length;
  const direction = randomUnit(seed, `${edgeId}-direction`) < 0.5 ? -1 : 1;
  const amplitude = Math.min(length * 0.12, cellScale * 0.05) * variation;
  const stations = [
    0,
    0.23 + randomSigned(seed, `${edgeId}-station-1`) * 0.025 * variation,
    0.5 + randomSigned(seed, `${edgeId}-station-2`) * 0.03 * variation,
    0.77 + randomSigned(seed, `${edgeId}-station-3`) * 0.025 * variation,
    1,
  ];
  const offsets = [
    0,
    direction * amplitude * (0.82 + randomUnit(seed, `${edgeId}-lobe-1`) * 0.18),
    -direction * amplitude * (0.55 + randomUnit(seed, `${edgeId}-lobe-2`) * 0.2),
    direction * amplitude * (0.43 + randomUnit(seed, `${edgeId}-lobe-3`) * 0.22),
    0,
  ];
  const slopes = offsets.map((offset, index) => {
    if (index === 0 || index === offsets.length - 1) return 0;
    return (
      ((offsets[index + 1] - offsets[index - 1]) /
        (stations[index + 1] - stations[index - 1])) *
      0.68
    );
  });
  const point = (along: number, outward: number): BiomorphicPoint => ({
    x: start.x + dx * along + normalX * outward,
    y: start.y + dy * along + normalY * outward,
  });

  return Array.from({ length: stations.length - 1 }, (_, index) => {
    const interval = stations[index + 1] - stations[index];
    return {
      kind: 'cubic' as const,
      start: point(stations[index], offsets[index]),
      control1: point(
        stations[index] + interval / 3,
        offsets[index] + (slopes[index] * interval) / 3,
      ),
      control2: point(
        stations[index + 1] - interval / 3,
        offsets[index + 1] - (slopes[index + 1] * interval) / 3,
      ),
      end: point(stations[index + 1], offsets[index + 1]),
    };
  });
}

function collectEdgeRecords(rawCells: readonly RawCell[]): Map<string, EdgeRecord> {
  const records = new Map<string, EdgeRecord>();

  rawCells.forEach((cell) => {
    cell.vertices.forEach((start, vertexIndex) => {
      const end = cell.vertices[(vertexIndex + 1) % cell.vertices.length];
      if (pointDistance(start, end) <= EPSILON) return;
      const key = edgeKey(start, end);
      const startKey = pointKey(start);
      const endKey = pointKey(end);
      const canonicalStart = startKey < endKey ? start : end;
      const canonicalEnd = startKey < endKey ? end : start;
      const record = records.get(key) ?? {
        start: canonicalStart,
        end: canonicalEnd,
        uses: [],
      };
      record.uses.push({ cellIndex: cell.index, start, end });
      records.set(key, record);
    });
  });

  return records;
}

function isPerimeterEdge(start: BiomorphicPoint, end: BiomorphicPoint): boolean {
  return (
    (start.x === 0 && end.x === 0) ||
    (start.x === 1 && end.x === 1) ||
    (start.y === 0 && end.y === 0) ||
    (start.y === 1 && end.y === 1)
  );
}

function buildTopology(
  rows: number,
  columns: number,
  rawCells: readonly RawCell[],
  seed: string,
  curveVariation: number,
): BiomorphicTopology {
  const records = collectEdgeRecords(rawCells);
  const edgeByKey = new Map<string, BiomorphicEdge>();
  const cellScale = Math.min(1 / rows, 1 / columns);

  [...records.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .forEach(([key, record]) => {
      if (record.uses.length < 1 || record.uses.length > 2) {
        throw new Error(`Invalid biomorphic seam ownership for ${key}`);
      }
      const exterior = record.uses.length === 1;
      if (exterior !== isPerimeterEdge(record.start, record.end)) {
        throw new Error(`Biomorphic seam ${key} does not tile the board`);
      }

      const ownerIds = record.uses
        .map(({ cellIndex }) => rawCells[cellIndex].id)
        .sort();
      const id = exterior
        ? `perimeter-${key}`
        : `shared-${ownerIds.join('--')}`;
      edgeByKey.set(key, {
        id,
        ownerIds,
        exterior,
        segments: exterior
          ? lineSegments(record.start, record.end)
          : curvedSegments(
              id,
              record.start,
              record.end,
              seed,
              cellScale,
              curveVariation,
            ),
      });
    });

  const cells: BiomorphicCell[] = rawCells.map((rawCell) => {
    const edgeTraversals = rawCell.vertices.map((start, vertexIndex) => {
      const end = rawCell.vertices[(vertexIndex + 1) % rawCell.vertices.length];
      const edge = edgeByKey.get(edgeKey(start, end));
      if (!edge) {
        throw new Error(`Missing biomorphic seam for ${rawCell.id}`);
      }
      const canonicalStart = edge.segments[0].start;
      return {
        edge,
        direction: pointEquals(start, canonicalStart) ? (1 as const) : (-1 as const),
      };
    });
    const neighborIds = [
      ...new Set(
        edgeTraversals
          .flatMap(({ edge }) => edge.ownerIds)
          .filter((ownerId) => ownerId !== rawCell.id),
      ),
    ].sort((first, second) => {
      const firstIndex = rawCells.findIndex(({ id }) => id === first);
      const secondIndex = rawCells.findIndex(({ id }) => id === second);
      return firstIndex - secondIndex;
    });

    return {
      id: rawCell.id,
      index: rawCell.index,
      row: rawCell.row,
      col: rawCell.col,
      site: { x: rawCell.x, y: rawCell.y },
      vertices: rawCell.vertices,
      edgeTraversals,
      neighborIds,
    };
  });

  return {
    rows,
    columns,
    cells,
    edges: [...edgeByKey.values()],
  };
}

function reverseSegment(segment: BiomorphicPathSegment): BiomorphicPathSegment {
  return segment.kind === 'line'
    ? { kind: 'line', start: segment.end, end: segment.start }
    : {
        kind: 'cubic',
        start: segment.end,
        control1: segment.control2,
        control2: segment.control1,
        end: segment.start,
      };
}

function traversedSegments(
  traversal: BiomorphicEdgeTraversal,
): readonly BiomorphicPathSegment[] {
  return traversal.direction === 1
    ? traversal.edge.segments
    : [...traversal.edge.segments].reverse().map(reverseSegment);
}

function pointOnCubic(
  segment: Extract<BiomorphicPathSegment, { kind: 'cubic' }>,
  progress: number,
): BiomorphicPoint {
  const inverse = 1 - progress;
  const startWeight = inverse * inverse * inverse;
  const firstControlWeight = 3 * inverse * inverse * progress;
  const secondControlWeight = 3 * inverse * progress * progress;
  const endWeight = progress * progress * progress;

  return {
    x:
      segment.start.x * startWeight +
      segment.control1.x * firstControlWeight +
      segment.control2.x * secondControlWeight +
      segment.end.x * endWeight,
    y:
      segment.start.y * startWeight +
      segment.control1.y * firstControlWeight +
      segment.control2.y * secondControlWeight +
      segment.end.y * endWeight,
  };
}

export function sampleBiomorphicEdge(
  edge: BiomorphicEdge,
  direction: 1 | -1,
  samplesPerCurve = SAMPLES_PER_CURVE,
): BiomorphicPoint[] {
  const segments = traversedSegments({ edge, direction });
  const points: BiomorphicPoint[] = [segments[0].start];

  segments.forEach((segment) => {
    if (segment.kind === 'line') {
      points.push(segment.end);
      return;
    }
    for (let sample = 1; sample <= samplesPerCurve; sample += 1) {
      points.push(pointOnCubic(segment, sample / samplesPerCurve));
    }
  });

  return points;
}

function resolveCell(
  topology: BiomorphicTopology,
  piece: string | number,
): BiomorphicCell {
  const cell =
    typeof piece === 'number'
      ? topology.cells[piece]
      : topology.cells.find(({ id }) => id === piece);
  if (!cell) throw new Error(`Biomorphic piece ${piece} is outside the topology`);
  return cell;
}

export function getBiomorphicPieceEdgeTraversals(
  topology: BiomorphicTopology,
  piece: string | number,
): readonly BiomorphicEdgeTraversal[] {
  return resolveCell(topology, piece).edgeTraversals;
}

export function sampleBiomorphicPieceOutline(
  topology: BiomorphicTopology,
  piece: string | number,
  samplesPerCurve = SAMPLES_PER_CURVE,
): BiomorphicPoint[] {
  const cell = resolveCell(topology, piece);
  const points: BiomorphicPoint[] = [];

  cell.edgeTraversals.forEach((traversal, edgeIndex) => {
    const edgePoints = sampleBiomorphicEdge(
      traversal.edge,
      traversal.direction,
      samplesPerCurve,
    );
    points.push(...(edgeIndex === 0 ? edgePoints : edgePoints.slice(1)));
  });

  if (
    points.length > 1 &&
    pointEquals(points[0], points[points.length - 1])
  ) {
    points.pop();
  }
  return points;
}

export function signedBiomorphicArea(
  points: readonly BiomorphicPoint[],
): number {
  let twiceArea = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  });
  return twiceArea / 2;
}

function orientation(
  first: BiomorphicPoint,
  second: BiomorphicPoint,
  third: BiomorphicPoint,
): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function pointIsOnSegment(
  point: BiomorphicPoint,
  start: BiomorphicPoint,
  end: BiomorphicPoint,
): boolean {
  return (
    Math.abs(orientation(start, end, point)) <= EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  );
}

function segmentsIntersect(
  firstStart: BiomorphicPoint,
  firstEnd: BiomorphicPoint,
  secondStart: BiomorphicPoint,
  secondEnd: BiomorphicPoint,
): boolean {
  const firstSideA = orientation(firstStart, firstEnd, secondStart);
  const firstSideB = orientation(firstStart, firstEnd, secondEnd);
  const secondSideA = orientation(secondStart, secondEnd, firstStart);
  const secondSideB = orientation(secondStart, secondEnd, firstEnd);

  if (
    firstSideA * firstSideB < -EPSILON &&
    secondSideA * secondSideB < -EPSILON
  ) {
    return true;
  }

  return (
    pointIsOnSegment(secondStart, firstStart, firstEnd) ||
    pointIsOnSegment(secondEnd, firstStart, firstEnd) ||
    pointIsOnSegment(firstStart, secondStart, secondEnd) ||
    pointIsOnSegment(firstEnd, secondStart, secondEnd)
  );
}

export function hasBiomorphicSelfIntersections(
  points: readonly BiomorphicPoint[],
): boolean {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0);
      if (adjacent) continue;

      if (
        segmentsIntersect(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function isTopologySafe(topology: BiomorphicTopology): boolean {
  const idealArea = 1 / topology.cells.length;
  const minimumSpan = Math.min(1 / topology.rows, 1 / topology.columns) * 0.28;
  let totalArea = 0;

  for (const cell of topology.cells) {
    const outline = sampleBiomorphicPieceOutline(topology, cell.index);
    const area = signedBiomorphicArea(outline);
    const xs = outline.map(({ x }) => x);
    const ys = outline.map(({ y }) => y);
    const withinBoard = outline.every(
      ({ x, y }) =>
        x >= -EPSILON && x <= 1 + EPSILON && y >= -EPSILON && y <= 1 + EPSILON,
    );

    if (
      area < idealArea * 0.32 ||
      Math.max(...xs) - Math.min(...xs) < minimumSpan ||
      Math.max(...ys) - Math.min(...ys) < minimumSpan ||
      !withinBoard ||
      hasBiomorphicSelfIntersections(outline)
    ) {
      return false;
    }
    totalArea += area;
  }

  return Math.abs(totalArea - 1) <= 1e-6;
}

/**
 * Builds a deterministic Voronoi tessellation and deforms each internal seam
 * exactly once. Every neighboring cell then traverses that same immutable edge
 * in reverse, so the generated pieces cannot develop pixel gaps after resize.
 */
export function createBiomorphicTopology(
  rows: number,
  columns: number,
  seed: string,
): BiomorphicTopology {
  assertDimensions(rows, columns);

  for (const siteVariation of SITE_VARIATION_ATTEMPTS) {
    const rawCells = createRawCells(rows, columns, seed, siteVariation);
    const rawCellsAreValid = rawCells.every(
      ({ vertices }) =>
        vertices.length >= 3 &&
        signedBiomorphicArea(vertices) > 1 / (rows * columns) * 0.32,
    );
    if (!rawCellsAreValid) continue;

    for (const curveVariation of CURVE_VARIATION_ATTEMPTS) {
      try {
        const topology = buildTopology(
          rows,
          columns,
          rawCells,
          seed,
          curveVariation,
        );
        if (isTopologySafe(topology)) return topology;
      } catch {
        // Quantized half-plane intersections can only fail at a degenerate
        // seed. Reducing site variation deterministically removes the tie.
      }
    }
  }

  throw new Error('Unable to generate a safe biomorphic puzzle topology');
}

function format(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function scaledPoint(
  point: BiomorphicPoint,
  boardWidth: number,
  boardHeight: number,
): BiomorphicPoint {
  return { x: point.x * boardWidth, y: point.y * boardHeight };
}

function pointCommand(
  point: BiomorphicPoint,
  boardWidth: number,
  boardHeight: number,
): string {
  const scaled = scaledPoint(point, boardWidth, boardHeight);
  return `${format(scaled.x)} ${format(scaled.y)}`;
}

function piecePath(
  cell: BiomorphicCell,
  boardWidth: number,
  boardHeight: number,
): string {
  const first = traversedSegments(cell.edgeTraversals[0])[0];
  const commands = [`M ${pointCommand(first.start, boardWidth, boardHeight)}`];

  cell.edgeTraversals.forEach((traversal) => {
    traversedSegments(traversal).forEach((segment) => {
      if (segment.kind === 'line') {
        commands.push(`L ${pointCommand(segment.end, boardWidth, boardHeight)}`);
      } else {
        commands.push(
          [
            'C',
            pointCommand(segment.control1, boardWidth, boardHeight),
            pointCommand(segment.control2, boardWidth, boardHeight),
            pointCommand(segment.end, boardWidth, boardHeight),
          ].join(' '),
        );
      }
    });
  });
  commands.push('Z');
  return commands.join(' ');
}

function cubicValue(
  start: number,
  control1: number,
  control2: number,
  end: number,
  progress: number,
): number {
  const inverse = 1 - progress;
  return (
    inverse * inverse * inverse * start +
    3 * inverse * inverse * progress * control1 +
    3 * inverse * progress * progress * control2 +
    progress * progress * progress * end
  );
}

function cubicExtrema(
  start: number,
  control1: number,
  control2: number,
  end: number,
): number[] {
  const cubic = -start + 3 * control1 - 3 * control2 + end;
  const quadratic = 3 * start - 6 * control1 + 3 * control2;
  const linear = -3 * start + 3 * control1;
  const a = 3 * cubic;
  const b = 2 * quadratic;
  const c = linear;

  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) return [];
    const root = -c / b;
    return root > 0 && root < 1 ? [root] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const squareRoot = Math.sqrt(discriminant);
  return [(-b + squareRoot) / (2 * a), (-b - squareRoot) / (2 * a)].filter(
    (root) => root > 0 && root < 1,
  );
}

function normalizedBounds(cell: BiomorphicCell): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  const include = (point: BiomorphicPoint): void => {
    xs.push(point.x);
    ys.push(point.y);
  };

  cell.edgeTraversals.forEach((traversal) => {
    traversedSegments(traversal).forEach((segment) => {
      include(segment.start);
      include(segment.end);
      if (segment.kind !== 'cubic') return;

      cubicExtrema(
        segment.start.x,
        segment.control1.x,
        segment.control2.x,
        segment.end.x,
      ).forEach((progress) =>
        xs.push(
          cubicValue(
            segment.start.x,
            segment.control1.x,
            segment.control2.x,
            segment.end.x,
            progress,
          ),
        ),
      );
      cubicExtrema(
        segment.start.y,
        segment.control1.y,
        segment.control2.y,
        segment.end.y,
      ).forEach((progress) =>
        ys.push(
          cubicValue(
            segment.start.y,
            segment.control1.y,
            segment.control2.y,
            segment.end.y,
            progress,
          ),
        ),
      );
    });
  });

  const left = Math.max(0, Math.min(...xs));
  const top = Math.max(0, Math.min(...ys));
  const right = Math.min(1, Math.max(...xs));
  const bottom = Math.min(1, Math.max(...ys));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function generateBiomorphicPieces(
  rows: number,
  columns: number,
  boardWidth: number,
  boardHeight: number,
  seed: string,
): PuzzlePieceDefinition[] {
  if (
    !Number.isFinite(boardWidth) ||
    !Number.isFinite(boardHeight) ||
    boardWidth <= 0 ||
    boardHeight <= 0
  ) {
    throw new Error('Biomorphic cutter board dimensions must be positive');
  }

  const topology = createBiomorphicTopology(rows, columns, seed);
  return topology.cells.map((cell) => {
    const clipRegion = normalizedBounds(cell);
    const bounds: Rect = {
      x: clipRegion.x * boardWidth,
      y: clipRegion.y * boardHeight,
      width: clipRegion.width * boardWidth,
      height: clipRegion.height * boardHeight,
    };

    return {
      id: cell.id,
      index: cell.index,
      row: cell.row,
      col: cell.col,
      path: piecePath(cell, boardWidth, boardHeight),
      bounds,
      clipRegion,
      correctPosition: { x: bounds.x, y: bounds.y },
      correctRotation: 0,
      neighborIds: cell.neighborIds,
    };
  });
}
