import { signedBiomorphicArea, type BiomorphicPoint as Point, type BiomorphicTopology } from './generateBiomorphic';
import { closestLines, distance, flattenEdge, forNearbyPairs, insidePolygon, lineContact, mix, samePoint, type FlatPoint } from './cutGeometry';

export type CutAuditOptions = {
  /** Deprecated: curves now use an error bound rather than fixed sampling. */
  samplesPerCurve?: number;
  /** Flattening error as a fraction of the smaller grid-cell side. */
  flatness?: number;
  pinchGap?: number;
  /** Minimum interior angle at a seam junction, in degrees. */
  minCornerAngle?: number;
  /** Report short acute wedges at a shared endpoint separately from necks. */
  separateJunctionTips?: boolean;
  areaRange?: readonly [number, number];
};
export type CutLocation = { edge: string; knot: number; point: Point };
export type CutPinch = {
  piece: number; at: Point; width: number; kind: 'neck' | 'gap' | 'tip';
  sides: readonly [CutLocation, CutLocation];
};
export type CutAudit = {
  crossings: Point[];
  crossingEdges: string[];
  pinches: CutPinch[];
  /** Intentional pointed junctions, when the caller enables their separation. */
  junctionTips: CutPinch[];
  oddAreas: { piece: number; ratio: number }[];
  sharpCorners: { piece: number; at: Point; angle: number }[];
  /** Narrowest neck/gap candidate; excludes separately reported pointed tips. */
  narrowestPerPiece: number[];
  /** Sum of outline areas, not a polygon union; never a standalone certificate. */
  coverage: number;
  topologyErrors: string[];
  /** Maximum approximation error in unit-board coordinates. */
  curveTolerance: number;
  clean: boolean;
};
type Segment = { a: FlatPoint; b: FlatPoint; edge: string; index: number; last: number };

/** Shape validity, independent of a style's chosen thickness/angle targets. */
export function hasValidCutPartition(audit: CutAudit): boolean {
  return audit.topologyErrors.length === 0 && audit.crossings.length === 0 && Math.abs(audit.coverage - 1) < 1e-6;
}

function permittedContact(a: Segment, b: Segment, point: Point): boolean {
  if (a.edge === b.edge) return Math.abs(a.index - b.index) === 1 &&
    ((samePoint(a.a, point) || samePoint(a.b, point)) && (samePoint(b.a, point) || samePoint(b.b, point)));
  const endpoint = (s: Segment) => (s.index === 0 && samePoint(s.a, point)) || (s.index === s.last && samePoint(s.b, point));
  return endpoint(a) && endpoint(b);
}

function isPointedJunction(a: CutLocation, b: CutLocation, edges: Map<string, BiomorphicTopology['edges'][number]>,
  shortArc: number, cellSide: number): boolean {
  if (a.edge === b.edge || shortArc > cellSide * 0.2) return false;
  const first = edges.get(a.edge)!, second = edges.get(b.edge)!;
  const ends = (edge: typeof first) => [
    { point: edge.segments[0].start, knot: 0 },
    { point: edge.segments[edge.segments.length - 1].end, knot: edge.segments.length },
  ];
  for (const x of ends(first)) for (const y of ends(second)) {
    // Both candidates must be in the first incident curve,
    // within a small neighborhood of this actual common junction. A returning
    // branch or a remote close pass must still be inspected as a neck/gap.
    if (!samePoint(x.point, y.point) || Math.abs(a.knot - x.knot) > 1 || Math.abs(b.knot - y.knot) > 1 ||
        distance(a.point, x.point) > cellSide * 0.1 || distance(b.point, x.point) > cellSide * 0.1) continue;
    const ax = a.point.x - x.point.x, ay = a.point.y - x.point.y;
    const bx = b.point.x - x.point.x, by = b.point.y - x.point.y;
    const angle = Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by) * 180 / Math.PI;
    if (angle > 0 && angle < 20) return true;
  }
  return false;
}

/** Validate the rectangular partition, not merely the sum of its areas. */
export function auditCut(topology: BiomorphicTopology, options: CutAuditOptions = {}): CutAudit {
  const { flatness = 0.0005, pinchGap = 0.06, minCornerAngle = 20, areaRange = [0.35, 2.4] } = options;
  if (!Number.isFinite(flatness) || flatness <= 0 || !Number.isFinite(pinchGap) || pinchGap < 0 ||
      !Number.isFinite(minCornerAngle) || minCornerAngle < 0 || minCornerAngle > 90 ||
      !areaRange.every(Number.isFinite) || areaRange[0] < 0 || areaRange[1] < areaRange[0]) throw new Error('Invalid cut audit tolerances');
  const cellSide = 1 / Math.max(topology.rows, topology.columns), curveTolerance = cellSide * flatness;
  const topologyErrors: string[] = [], crossings: Point[] = [], crossingEdges = new Set<string>();
  const pinches: CutPinch[] = [], junctionTips: CutPinch[] = [], oddAreas: CutAudit['oddAreas'] = [], narrowestPerPiece: number[] = [];
  const sharpCorners: CutAudit['sharpCorners'] = [];
  let coverage = 0;
  const result = (): CutAudit => ({ crossings, crossingEdges: [...crossingEdges], pinches, junctionTips, oddAreas, sharpCorners, narrowestPerPiece,
    coverage, topologyErrors, curveTolerance, clean: topologyErrors.length === 0 && crossings.length === 0 &&
    pinches.length === 0 && oddAreas.length === 0 && sharpCorners.length === 0 && Math.abs(coverage - 1) < 1e-6 });
  if (!Number.isInteger(topology.rows) || !Number.isInteger(topology.columns) || topology.rows < 1 || topology.columns < 1 ||
      topology.cells.length !== topology.rows * topology.columns) {
    topologyErrors.push('Invalid dimensions or piece count'); return result();
  }
  const flattened = new Map<string, FlatPoint[]>(), edgeById = new Map(topology.edges.map(e => [e.id, e]));
  const uses = new Map<string, { owner: string; direction: number }[]>();
  if (edgeById.size !== topology.edges.length) topologyErrors.push('Duplicate edge IDs');
  if (new Set(topology.cells.map(c => c.id)).size !== topology.cells.length) topologyErrors.push('Duplicate piece IDs');
  if (new Set(topology.cells.map(c => c.index)).size !== topology.cells.length) topologyErrors.push('Duplicate piece indices');
  const segments: Segment[] = [], frame: [number, number][][] = [[], [], [], []];
  for (const edge of topology.edges) {
    try {
      const points = flattenEdge(edge, curveTolerance);
      flattened.set(edge.id, points);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (samePoint(a, b)) { topologyErrors.push(`Zero-length segment: ${edge.id}`); continue; }
        if ([a, b].some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) topologyErrors.push(`Outside board: ${edge.id}`);
        segments.push({ a, b, edge: edge.id, index: i - 1, last: points.length - 2 });
        if (edge.exterior) {
          const side = a.x === 0 && b.x === 0 ? 0 : a.x === 1 && b.x === 1 ? 1 :
            a.y === 0 && b.y === 0 ? 2 : a.y === 1 && b.y === 1 ? 3 : -1;
          if (side < 0) topologyErrors.push(`Exterior edge off frame: ${edge.id}`);
          else frame[side].push(side < 2 ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)]);
        }
      }
    } catch (error) { topologyErrors.push(String(error)); }
  }
  if (topologyErrors.length) return result();
  for (const intervals of frame) {
    intervals.sort((a, b) => a[0] - b[0]);
    let end = 0;
    for (const interval of intervals) {
      if (Math.abs(interval[0] - end) > 1e-9) topologyErrors.push('Frame has a gap or duplicate coverage');
      end = interval[1];
    }
    if (Math.abs(end - 1) > 1e-9) topologyErrors.push('Incomplete board frame');
  }
  forNearbyPairs(segments, cellSide / 8, 0, (a, b) => {
    const hit = lineContact(a, b);
    if (hit && (hit.overlap || !permittedContact(a, b, hit.point))) {
      crossings.push(hit.point); crossingEdges.add(a.edge); crossingEdges.add(b.edge);
    }
  });
  for (const cell of topology.cells) {
    const outline: Point[] = [], ring: (Segment & { arc: number; length: number })[] = [];
    let arc = 0;
    for (const { edge, direction } of cell.edgeTraversals) {
      if (edgeById.get(edge.id) !== edge || (direction !== 1 && direction !== -1)) {
        topologyErrors.push(`Invalid traversal in ${cell.id}`); continue;
      }
      const edgeUses = uses.get(edge.id) ?? [];
      edgeUses.push({ owner: cell.id, direction }); uses.set(edge.id, edgeUses);
      const flat = flattened.get(edge.id)!, points = direction === 1 ? flat : [...flat].reverse();
      if (outline.length && !samePoint(outline[outline.length - 1], points[0])) topologyErrors.push(`Open contour: ${cell.id}`);
      if (!outline.length) outline.push(points[0]);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], length = distance(a, b);
        ring.push({ a, b, edge: edge.id, index: i - 1, last: points.length - 2, arc, length });
        arc += length; outline.push(b);
      }
    }
    if (outline.length < 4 || !samePoint(outline[0], outline[outline.length - 1])) {
      topologyErrors.push(`Unclosed piece: ${cell.id}`); continue;
    }
    outline.pop();
    ring.forEach((segment, index) => {
      const previous = ring[(index + ring.length - 1) % ring.length];
      if (previous.edge === segment.edge) return;
      const ux = previous.b.x - previous.a.x, uy = previous.b.y - previous.a.y;
      const vx = segment.b.x - segment.a.x, vy = segment.b.y - segment.a.y;
      const angle = (Math.PI - Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180 / Math.PI;
      if (angle < minCornerAngle) sharpCorners.push({ piece: cell.index, at: segment.a, angle });
    });
    const neighbors = new Set(cell.edgeTraversals.flatMap(t => t.edge.ownerIds.filter(id => id !== cell.id)));
    if (new Set(cell.neighborIds).size !== neighbors.size || cell.neighborIds.some(id => !neighbors.has(id))) topologyErrors.push(`Invalid neighbors: ${cell.id}`);
    const visited = new Set<string>();
    for (const p of outline) {
      const key = `${p.x.toFixed(10)},${p.y.toFixed(10)}`;
      if (visited.has(key)) topologyErrors.push(`Repeated contour vertex: ${cell.id}`);
      visited.add(key);
    }
    const area = signedBiomorphicArea(outline);
    if (!(area > 0)) topologyErrors.push(`Inverted or empty piece: ${cell.id}`);
    coverage += Math.abs(area);
    const ratio = Math.abs(area) * topology.cells.length;
    if (ratio < areaRange[0] || ratio > areaRange[1]) oddAreas.push({ piece: cell.index, ratio });
    let narrowest: CutPinch | undefined;
    let narrowestTip: CutPinch | undefined;
    const radius = Math.max(pinchGap * cellSide + 2 * curveTolerance, cellSide * 0.1);
    forNearbyPairs(ring, Math.max(radius, cellSide / 8), radius / 2, (a, b, i, j) => {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) return;
      const dx = Math.max(0, Math.min(a.a.x, a.b.x) - Math.max(b.a.x, b.b.x), Math.min(b.a.x, b.b.x) - Math.max(a.a.x, a.b.x));
      const dy = Math.max(0, Math.min(a.a.y, a.b.y) - Math.max(b.a.y, b.b.y), Math.min(b.a.y, b.b.y) - Math.max(a.a.y, a.b.y));
      if (dx * dx + dy * dy > radius * radius) return;
      const nearest = closestLines(a, b);
      if (nearest.width > radius || (narrowest && nearest.width >= narrowest.width * cellSide)) return;
      const along = Math.abs(a.arc + nearest.t * a.length - b.arc - nearest.u * b.length);
      const shortArc = Math.min(along, arc - along);
      if (shortArc <= 4 * nearest.width + 2 * curveTolerance) return;
      const candidate: CutPinch = { piece: cell.index, at: mix(nearest.a, nearest.b, 0.5), width: nearest.width / cellSide, kind: 'neck', sides: [
        { edge: a.edge, knot: a.a.knot + nearest.t * (a.b.knot - a.a.knot), point: nearest.a },
        { edge: b.edge, knot: b.a.knot + nearest.u * (b.b.knot - b.a.knot), point: nearest.b },
      ] };
      if (options.separateJunctionTips && isPointedJunction(candidate.sides[0], candidate.sides[1], edgeById, shortArc, cellSide)) {
        if (!narrowestTip || candidate.width < narrowestTip.width) narrowestTip = { ...candidate, kind: 'tip' };
        return;
      }
      if (!narrowest || candidate.width < narrowest.width) narrowest = candidate;
    });
    const pinch = narrowest as CutPinch | undefined;
    narrowestPerPiece.push(pinch?.width ?? Infinity);
    if (pinch && pinch.width * cellSide < pinchGap * cellSide + 2 * curveTolerance) {
      pinch.kind = insidePolygon(pinch.at, outline) ? 'neck' : 'gap'; pinches.push(pinch);
    }
    const tip = narrowestTip as CutPinch | undefined;
    if (tip && tip.width * cellSide < pinchGap * cellSide + 2 * curveTolerance) junctionTips.push(tip);
  }
  for (const edge of topology.edges) {
    const edgeUses = uses.get(edge.id) ?? [], expected = edge.exterior ? 1 : 2;
    if (edge.ownerIds.length !== expected || new Set(edge.ownerIds).size !== expected || edgeUses.length !== expected ||
        edgeUses.some(u => !edge.ownerIds.includes(u.owner)) || new Set(edgeUses.map(u => u.owner)).size !== expected ||
        (expected === 2 && edgeUses[0].direction === edgeUses[1].direction)) topologyErrors.push(`Invalid ownership: ${edge.id}`);
  }
  if (Math.abs(coverage - 1) >= 1e-6) topologyErrors.push('Outline areas do not sum to the board');
  return result();
}
