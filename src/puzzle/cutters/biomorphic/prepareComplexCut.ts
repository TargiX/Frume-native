import { decodeBakedCut, type BakedCut } from './bakedCut';
import { distance, flattenEdge } from './cutGeometry';
import { signedBiomorphicArea, type BiomorphicTopology } from './generateBiomorphic';
import { assertBakedCutAccepted, prepareBakedCut, type PreparedCut } from './prepareBakedCut';

/** Offline processing target for extreme defects; not a phone hit-target size. */
export const COMPLEX_CUT_REPAIR_OPTIONS = {
  pinchGap: 0.01,
  flatness: 0.00005,
  minCornerAngle: 0,
  separateJunctionTips: true,
  maxMovement: 0.015,
  maxPasses: 64,
} as const;

export type CutShapeChange = {
  seamLengthRatio: number;
  maximumEdgeLengthChange: number;
  maximumPieceAreaChange: number;
  /** Control-hull bound on curve movement, as a fraction of cell side. */
  maximumCurveMovement: number;
  changedKnots: number;
  changedEdges: string[];
};

function measurements(topology: BiomorphicTopology) {
  const tolerance = COMPLEX_CUT_REPAIR_OPTIONS.flatness / Math.max(topology.rows, topology.columns);
  const edges = new Map(topology.edges.map(edge => {
    const flat = flattenEdge(edge, tolerance);
    const length = flat.slice(1).reduce((sum, p, i) => sum + distance(p, flat[i]), 0);
    return [edge.id, { edge, flat, length }] as const;
  }));
  const areas = topology.cells.map(cell => signedBiomorphicArea(cell.edgeTraversals.flatMap(t => {
    const points = edges.get(t.edge.id)!.flat;
    return t.direction === 1 ? points : [...points].reverse();
  })));
  return { edges, areas, seamLength: [...edges.values()].reduce((sum, e) => sum + (e.edge.exterior ? 0 : e.length), 0) };
}

/** Independent shape checks prevent acceptance from erasing a style's fringe. */
export function measureCutShapeChange(before: BiomorphicTopology, after: BiomorphicTopology): CutShapeChange {
  const first = measurements(before), second = measurements(after);
  const cellSide = 1 / Math.max(before.rows, before.columns), meanArea = 1 / before.cells.length;
  let maximumCurveMovement = 0, changedKnots = 0, maximumEdgeLengthChange = 0;
  const changedEdges: string[] = [];
  for (const [id, original] of first.edges) {
    const candidate = second.edges.get(id);
    if (!candidate || candidate.edge.segments.length !== original.edge.segments.length) throw new Error('Correction changed edge topology');
    let changed = false;
    original.edge.segments.forEach((segment, index) => {
      const next = candidate.edge.segments[index];
      if (segment.kind !== next.kind) throw new Error('Correction changed segment type');
      if (distance(segment.end, next.end) > 1e-12) { changed = true; changedKnots++; }
      const a = segment.kind === 'line' ? [segment.start, segment.end] : [segment.start, segment.control1, segment.control2, segment.end];
      const b = next.kind === 'line' ? [next.start, next.end] : [next.start, next.control1, next.control2, next.end];
      for (let i = 0; i < a.length; i++) maximumCurveMovement = Math.max(maximumCurveMovement, distance(a[i], b[i]) / cellSide);
    });
    if (changed) {
      changedEdges.push(id);
      maximumEdgeLengthChange = Math.max(maximumEdgeLengthChange, Math.abs(candidate.length / original.length - 1));
    }
  }
  return { seamLengthRatio: first.seamLength === 0 ? 1 : second.seamLength / first.seamLength, maximumEdgeLengthChange,
    maximumPieceAreaChange: Math.max(...first.areas.map((area, i) => Math.abs(second.areas[i] - area) / meanArea)),
    maximumCurveMovement, changedKnots, changedEdges };
}

export type PreparedComplexCut = PreparedCut & { shapeChange?: CutShapeChange; rejectionReasons: string[] };

export function prepareComplexCut(input: BakedCut): PreparedComplexCut {
  const before = decodeBakedCut(input);
  const options = { ...COMPLEX_CUT_REPAIR_OPTIONS, tension: input.tension };
  const prepared = prepareBakedCut(before, options);
  const rejectionReasons: string[] = [];
  if (!prepared.accepted) rejectionReasons.push('Unresolved geometry or clearance defect');
  if (prepared.audit.topologyErrors.length) return { ...prepared, rejectionReasons };
  const shapeChange = measureCutShapeChange(before, prepared.topology);
  if (shapeChange.maximumCurveMovement > 0.02 + Math.SQRT2 * Math.max(input.rows, input.columns) / 65535) rejectionReasons.push('Curve movement exceeds 2% of a cell');
  if (Math.abs(shapeChange.seamLengthRatio - 1) > 0.005) rejectionReasons.push('Total seam length changed by more than 0.5%');
  if (shapeChange.maximumEdgeLengthChange > 0.05) rejectionReasons.push('One seam length changed by more than 5%');
  if (shapeChange.maximumPieceAreaChange > 0.015) rejectionReasons.push('One piece area changed by more than 1.5% of mean piece area');
  const accepted = prepared.accepted && rejectionReasons.length === 0;
  // Preserve the exact original payload when no correction was needed.
  const baked = accepted ? (shapeChange.changedKnots === 0 ? input : prepared.baked) : undefined;
  if (baked && input.rows !== input.columns) assertBakedCutAccepted(baked, options);
  return { ...prepared, accepted, baked, shapeChange, rejectionReasons };
}
