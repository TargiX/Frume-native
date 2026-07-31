import type { Rect } from '../../types/geometry';
import type { PuzzlePieceDefinition } from '../../types/layout';

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type OrganicPathSegment =
  | {
      kind: 'line';
      start: NormalizedPoint;
      end: NormalizedPoint;
    }
  | {
      kind: 'cubic';
      start: NormalizedPoint;
      control1: NormalizedPoint;
      control2: NormalizedPoint;
      end: NormalizedPoint;
    };

export type OrganicEdge = {
  id: string;
  segments: readonly OrganicPathSegment[];
};

export type OrganicTopology = {
  rows: number;
  columns: number;
  vertices: readonly (readonly NormalizedPoint[])[];
  /** Canonical direction is left to right. */
  horizontalEdges: readonly (readonly OrganicEdge[])[];
  /** Canonical direction is top to bottom. */
  verticalEdges: readonly (readonly OrganicEdge[])[];
};

export type OrganicEdgeTraversal = {
  edge: OrganicEdge;
  direction: 1 | -1;
};

const VARIATION_ATTEMPTS = [1, 0.78, 0.56, 0.36] as const;
const SAMPLES_PER_CURVE = 12;
const EPSILON = 1e-9;

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // An avalanche step keeps adjacent human-readable seeds from producing
  // visibly related cuts.
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
 * Stores a short canonical seed in the layout rather than leaking a source
 * image URL (which can contain signed query parameters).
 */
export function canonicalizeOrganicSeed(seed: string | number): string {
  return `org-${hashString(String(seed)).toString(16).padStart(8, '0')}`;
}

function assertGridDimensions(rows: number, columns: number): void {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1
  ) {
    throw new Error('Organic cutter rows and columns must be positive integers');
  }
}

function createVertices(
  rows: number,
  columns: number,
  seed: string,
  variation: number,
): NormalizedPoint[][] {
  const cellWidth = 1 / columns;
  const cellHeight = 1 / rows;
  const jitterRatio = 0.21 * variation;

  return Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => {
      const onHorizontalBoundary = row === 0 || row === rows;
      const onVerticalBoundary = column === 0 || column === columns;

      return {
        x:
          column / columns +
          (onVerticalBoundary
            ? 0
            : randomSigned(seed, `vertex-x-${row}-${column}`) *
              cellWidth *
              jitterRatio),
        y:
          row / rows +
          (onHorizontalBoundary
            ? 0
            : randomSigned(seed, `vertex-y-${row}-${column}`) *
              cellHeight *
              jitterRatio),
      };
    }),
  );
}

function lineEdge(
  id: string,
  start: NormalizedPoint,
  end: NormalizedPoint,
): OrganicEdge {
  return {
    id,
    segments: [{ kind: 'line', start, end }],
  };
}

function curvedEdge(
  id: string,
  start: NormalizedPoint,
  end: NormalizedPoint,
  seed: string,
  corridorWidth: number,
  variation: number,
): OrganicEdge {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const normalX = -dy / length;
  const normalY = dx / length;
  const direction = randomUnit(seed, `${id}-direction`) < 0.5 ? -1 : 1;
  const amplitude = corridorWidth * variation;
  const stations = [
    0,
    0.22 + randomSigned(seed, `${id}-station-1`) * 0.035 * variation,
    0.5 + randomSigned(seed, `${id}-station-2`) * 0.04 * variation,
    0.78 + randomSigned(seed, `${id}-station-3`) * 0.035 * variation,
    1,
  ];
  const offsets = [
    0,
    direction *
      amplitude *
      (0.115 + randomUnit(seed, `${id}-lobe-1`) * 0.05),
    -direction *
      amplitude *
      (0.085 + randomUnit(seed, `${id}-lobe-2`) * 0.045),
    direction *
      amplitude *
      (0.075 + randomUnit(seed, `${id}-lobe-3`) * 0.05),
    0,
  ];
  const slopes = offsets.map((offset, index) => {
    if (index === 0 || index === offsets.length - 1) {
      return 0;
    }

    return (
      ((offsets[index + 1] - offsets[index - 1]) /
        (stations[index + 1] - stations[index - 1])) *
      0.72
    );
  });
  const point = (along: number, outward: number): NormalizedPoint => ({
    x: start.x + dx * along + normalX * outward,
    y: start.y + dy * along + normalY * outward,
  });
  const segments: OrganicPathSegment[] = [];

  for (let index = 0; index < stations.length - 1; index += 1) {
    const interval = stations[index + 1] - stations[index];

    segments.push({
      kind: 'cubic',
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
    });
  }

  // Four tangent-continuous cubics create three unequal, alternating lobes. The
  // first and last tangents follow the underlying lattice edge, so four seams
  // can meet cleanly at a vertex without looking like a Classic puzzle tab.
  return {
    id,
    segments,
  };
}

function buildTopology(
  rows: number,
  columns: number,
  seed: string,
  variation: number,
): OrganicTopology {
  const vertices = createVertices(rows, columns, seed, variation);
  const corridorWidth = Math.min(1 / columns, 1 / rows);
  const horizontalEdges = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const id = `h-${row}-${column}`;
      const start = vertices[row][column];
      const end = vertices[row][column + 1];

      return row === 0 || row === rows
        ? lineEdge(id, start, end)
        : curvedEdge(id, start, end, seed, corridorWidth, variation);
    }),
  );
  const verticalEdges = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => {
      const id = `v-${row}-${column}`;
      const start = vertices[row][column];
      const end = vertices[row + 1][column];

      return column === 0 || column === columns
        ? lineEdge(id, start, end)
        : curvedEdge(id, start, end, seed, corridorWidth, variation);
    }),
  );

  return {
    rows,
    columns,
    vertices,
    horizontalEdges,
    verticalEdges,
  };
}

export function getOrganicPieceEdgeTraversals(
  topology: OrganicTopology,
  row: number,
  column: number,
): readonly OrganicEdgeTraversal[] {
  if (
    row < 0 ||
    row >= topology.rows ||
    column < 0 ||
    column >= topology.columns
  ) {
    throw new Error(`Organic piece ${row}:${column} is outside the topology`);
  }

  return [
    { edge: topology.horizontalEdges[row][column], direction: 1 },
    { edge: topology.verticalEdges[row][column + 1], direction: 1 },
    { edge: topology.horizontalEdges[row + 1][column], direction: -1 },
    { edge: topology.verticalEdges[row][column], direction: -1 },
  ];
}

function pointOnCubic(
  segment: Extract<OrganicPathSegment, { kind: 'cubic' }>,
  progress: number,
): NormalizedPoint {
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

function traversedSegments(
  traversal: OrganicEdgeTraversal,
): readonly OrganicPathSegment[] {
  if (traversal.direction === 1) {
    return traversal.edge.segments;
  }

  return [...traversal.edge.segments].reverse().map((segment) =>
    segment.kind === 'line'
      ? {
          kind: 'line' as const,
          start: segment.end,
          end: segment.start,
        }
      : {
          kind: 'cubic' as const,
          start: segment.end,
          control1: segment.control2,
          control2: segment.control1,
          end: segment.start,
        },
  );
}

export function sampleOrganicPieceOutline(
  topology: OrganicTopology,
  row: number,
  column: number,
  samplesPerCurve = SAMPLES_PER_CURVE,
): NormalizedPoint[] {
  const traversals = getOrganicPieceEdgeTraversals(topology, row, column);
  const firstSegment = traversedSegments(traversals[0])[0];
  const points: NormalizedPoint[] = [firstSegment.start];

  traversals.forEach((traversal) => {
    traversedSegments(traversal).forEach((segment) => {
      if (segment.kind === 'line') {
        points.push(segment.end);
        return;
      }

      for (let sample = 1; sample <= samplesPerCurve; sample += 1) {
        points.push(pointOnCubic(segment, sample / samplesPerCurve));
      }
    });
  });

  const last = points[points.length - 1];
  const first = points[0];
  if (
    Math.abs(last.x - first.x) < EPSILON &&
    Math.abs(last.y - first.y) < EPSILON
  ) {
    points.pop();
  }

  return points;
}

export function signedPolygonArea(points: readonly NormalizedPoint[]): number {
  let twiceArea = 0;

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  });

  return twiceArea / 2;
}

function orientation(
  first: NormalizedPoint,
  second: NormalizedPoint,
  third: NormalizedPoint,
): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function pointIsOnSegment(
  point: NormalizedPoint,
  start: NormalizedPoint,
  end: NormalizedPoint,
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
  firstStart: NormalizedPoint,
  firstEnd: NormalizedPoint,
  secondStart: NormalizedPoint,
  secondEnd: NormalizedPoint,
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

export function hasSelfIntersections(
  points: readonly NormalizedPoint[],
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

      if (adjacent) {
        continue;
      }

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

function isTopologySafe(topology: OrganicTopology): boolean {
  const idealArea = 1 / (topology.rows * topology.columns);
  const minimumWidth = (1 / topology.columns) * 0.42;
  const minimumHeight = (1 / topology.rows) * 0.42;

  for (let row = 0; row < topology.rows; row += 1) {
    for (let column = 0; column < topology.columns; column += 1) {
      const outline = sampleOrganicPieceOutline(topology, row, column);
      const area = Math.abs(signedPolygonArea(outline));
      const xs = outline.map((point) => point.x);
      const ys = outline.map((point) => point.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);

      if (
        area < idealArea * 0.42 ||
        width < minimumWidth ||
        height < minimumHeight ||
        hasSelfIntersections(outline)
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Builds seams in normalized space. Variation is reduced deterministically if
 * an unusual seed ever creates an unsafe cell; invalid geometry is never
 * returned to the renderer.
 */
export function createOrganicTopology(
  rows: number,
  columns: number,
  seed: string,
): OrganicTopology {
  assertGridDimensions(rows, columns);

  for (const variation of VARIATION_ATTEMPTS) {
    const topology = buildTopology(rows, columns, seed, variation);
    if (isTopologySafe(topology)) {
      return topology;
    }
  }

  throw new Error('Unable to generate a safe organic puzzle topology');
}

function format(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function scalePoint(
  point: NormalizedPoint,
  boardWidth: number,
  boardHeight: number,
): NormalizedPoint {
  return {
    x: point.x * boardWidth,
    y: point.y * boardHeight,
  };
}

function pointCommand(
  point: NormalizedPoint,
  boardWidth: number,
  boardHeight: number,
): string {
  const scaled = scalePoint(point, boardWidth, boardHeight);
  return `${format(scaled.x)} ${format(scaled.y)}`;
}

function piecePath(
  topology: OrganicTopology,
  row: number,
  column: number,
  boardWidth: number,
  boardHeight: number,
): string {
  const traversals = getOrganicPieceEdgeTraversals(topology, row, column);
  const firstSegment = traversedSegments(traversals[0])[0];
  const commands = [
    `M ${pointCommand(firstSegment.start, boardWidth, boardHeight)}`,
  ];

  traversals.forEach((traversal) => {
    traversedSegments(traversal).forEach((segment) => {
      if (segment.kind === 'line') {
        commands.push(
          `L ${pointCommand(segment.end, boardWidth, boardHeight)}`,
        );
        return;
      }

      commands.push(
        [
          'C',
          pointCommand(segment.control1, boardWidth, boardHeight),
          pointCommand(segment.control2, boardWidth, boardHeight),
          pointCommand(segment.end, boardWidth, boardHeight),
        ].join(' '),
      );
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
    if (Math.abs(b) < EPSILON) {
      return [];
    }
    const root = -c / b;
    return root > 0 && root < 1 ? [root] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return [];
  }

  const squareRoot = Math.sqrt(discriminant);
  return [(-b + squareRoot) / (2 * a), (-b - squareRoot) / (2 * a)].filter(
    (root) => root > 0 && root < 1,
  );
}

function normalizedPieceBounds(
  topology: OrganicTopology,
  row: number,
  column: number,
): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  const includePoint = (point: NormalizedPoint): void => {
    xs.push(point.x);
    ys.push(point.y);
  };

  getOrganicPieceEdgeTraversals(topology, row, column).forEach(
    ({ edge }) => {
      edge.segments.forEach((segment) => {
        includePoint(segment.start);
        includePoint(segment.end);

        if (segment.kind === 'cubic') {
          cubicExtrema(
            segment.start.x,
            segment.control1.x,
            segment.control2.x,
            segment.end.x,
          ).forEach((progress) => {
            xs.push(
              cubicValue(
                segment.start.x,
                segment.control1.x,
                segment.control2.x,
                segment.end.x,
                progress,
              ),
            );
          });
          cubicExtrema(
            segment.start.y,
            segment.control1.y,
            segment.control2.y,
            segment.end.y,
          ).forEach((progress) => {
            ys.push(
              cubicValue(
                segment.start.y,
                segment.control1.y,
                segment.control2.y,
                segment.end.y,
                progress,
              ),
            );
          });
        }
      });
    },
  );

  const left = Math.max(0, Math.min(...xs));
  const top = Math.max(0, Math.min(...ys));
  const right = Math.min(1, Math.max(...xs));
  const bottom = Math.min(1, Math.max(...ys));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function neighborIds(
  row: number,
  column: number,
  rows: number,
  columns: number,
  idFor: (pieceRow: number, pieceColumn: number) => string,
): string[] {
  const neighbors: string[] = [];
  if (row > 0) neighbors.push(idFor(row - 1, column));
  if (row < rows - 1) neighbors.push(idFor(row + 1, column));
  if (column > 0) neighbors.push(idFor(row, column - 1));
  if (column < columns - 1) neighbors.push(idFor(row, column + 1));
  return neighbors;
}

export function generateOrganicPieces(
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
    throw new Error('Organic cutter board dimensions must be positive');
  }

  const topology = createOrganicTopology(rows, columns, seed);
  const idFor = (row: number, column: number) => `organic-${row}-${column}`;
  const pieces: PuzzlePieceDefinition[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const normalizedBounds = normalizedPieceBounds(topology, row, column);
      const bounds: Rect = {
        x: normalizedBounds.x * boardWidth,
        y: normalizedBounds.y * boardHeight,
        width: normalizedBounds.width * boardWidth,
        height: normalizedBounds.height * boardHeight,
      };

      pieces.push({
        id: idFor(row, column),
        index: pieces.length,
        row,
        col: column,
        path: piecePath(
          topology,
          row,
          column,
          boardWidth,
          boardHeight,
        ),
        bounds,
        clipRegion: normalizedBounds,
        correctPosition: { x: bounds.x, y: bounds.y },
        correctRotation: 0,
        neighborIds: neighborIds(row, column, rows, columns, idFor),
      });
    }
  }

  return pieces;
}
