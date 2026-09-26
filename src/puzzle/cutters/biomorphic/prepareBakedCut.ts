import { auditCut, hasValidCutPartition, type CutAudit, type CutAuditOptions } from './auditCut';
import { decodeBakedCut, encodeBakedCut, type BakedCut } from './bakedCut';
import { distance, mix } from './cutGeometry';
import type { BiomorphicPoint as Point, BiomorphicTopology } from './generateBiomorphic';
import { curveThroughPoints } from './generateBiomorphicPhaseField';

export type PreparedCut = {
  accepted: boolean;
  baked?: BakedCut;
  topology: BiomorphicTopology;
  before: CutAudit;
  audit: CutAudit;
  repair: { passes: number; changedEdges: string[]; maxMovement: number };
};
export type PrepareCutOptions = CutAuditOptions & { maxPasses?: number; maxMovement?: number; tension?: number };

const edgePoints = (edge: BiomorphicTopology['edges'][number]): Point[] => [edge.segments[0].start, ...edge.segments.map(s => s.end)];
function replaceEdges(topology: BiomorphicTopology, points: Map<string, Point[]>, tension: number): BiomorphicTopology {
  const edges = topology.edges.map(edge => points.has(edge.id)
    ? { ...edge, segments: curveThroughPoints(points.get(edge.id)!, tension) } : edge);
  const byId = new Map(edges.map(edge => [edge.id, edge]));
  return { ...topology, edges, cells: topology.cells.map(cell => ({ ...cell,
    edgeTraversals: cell.edgeTraversals.map(t => ({ ...t, edge: byId.get(t.edge.id)! })),
  })) };
}
const score = (audit: CutAudit, gap: number) => audit.topologyErrors.length * 100000 +
  audit.crossings.length * 1000 + (audit.oddAreas.length + audit.sharpCorners.length) * 100 +
  audit.pinches.reduce((sum, pinch) => sum + 1 + Math.max(0, gap - pinch.width), 0);

/**
 * Offline-only acceptance and bounded local repair of shared seams. Each
 * trial is quantized and reconstructed before inspection. Endpoints and the
 * board frame remain fixed; failed repair yields no publishable payload.
 */
export function prepareBakedCut(input: BiomorphicTopology, options: PrepareCutOptions = {}): PreparedCut {
  const { maxPasses = 24, maxMovement = 0.06, pinchGap = 0.06, tension = 0.52 } = options;
  if (!Number.isInteger(maxPasses) || maxPasses < 0 || maxPasses > 64 || !Number.isFinite(maxMovement) || maxMovement < 0 || maxMovement > 0.2 || !Number.isFinite(tension) || tension < 0 || tension > 1) {
    throw new Error('Invalid cut repair bounds');
  }
  const inputAudit = auditCut(input, options);
  if (inputAudit.topologyErrors.length) return { accepted: false, topology: input, before: inputAudit, audit: inputAudit,
    repair: { passes: 0, changedEdges: [], maxMovement: 0 } };
  let baked = encodeBakedCut(input, tension), topology = decodeBakedCut(baked), audit = auditCut(topology, options);
  const before = audit, cellSide = 1 / Math.max(input.rows, input.columns);
  // The audit includes both curves' flattening error. Keep rewarding progress
  // through that allowance instead of stalling at the nominal minimum gap.
  const requiredGap = pinchGap + 2 * (options.flatness ?? 0.0005);
  const originals = new Map(topology.edges.map(edge => [edge.id, edgePoints(edge)]));
  const changedEdges = new Set<string>();
  let passes = 0, movement = 0;
  for (; passes < maxPasses && !audit.clean; passes++) {
    if (audit.topologyErrors.length || audit.oddAreas.length) break;
    const byId = new Map(topology.edges.map(edge => [edge.id, edge]));
    const forces = new Map<string, { knot: number; delta: Point }[]>();
    for (const pinch of audit.pinches) {
      const [a, b] = pinch.sides, width = distance(a.point, b.point);
      if (width < 1e-10) continue;
      const movable = pinch.sides.filter(s => !byId.get(s.edge)!.exterior);
      const amount = Math.max(0, (requiredGap + 0.003) * cellSide - width) / Math.max(1, movable.length);
      for (const side of movable) {
        const sign = side === a ? 1 : -1, items = forces.get(side.edge) ?? [];
        items.push({ knot: side.knot, delta: { x: sign * (a.point.x - b.point.x) / width * amount,
          y: sign * (a.point.y - b.point.y) / width * amount } });
        forces.set(side.edge, items);
      }
    }
    let improved = false;
    for (const strength of [1, 0.5, 0.25]) {
      const replacements = new Map<string, Point[]>();
      for (const edge of topology.edges) {
        if (edge.exterior || (!forces.has(edge.id) && !audit.crossingEdges.includes(edge.id))) continue;
        const points = edgePoints(edge), original = originals.get(edge.id)!;
        const arcs = [0];
        for (let i = 1; i < points.length; i++) arcs.push(arcs[i - 1] + distance(points[i - 1], points[i]));
        const moved = points.map((point, index) => {
          if (index === 0 || index === points.length - 1) return point;
          let dx = 0, dy = 0;
          for (const force of forces.get(edge.id) ?? []) {
            const k = Math.min(points.length - 2, Math.floor(force.knot));
            const arc = arcs[k] + (force.knot - k) * (arcs[k + 1] - arcs[k]);
            const weight = Math.max(0, 1 - Math.abs(arcs[index] - arc) / (cellSide * 0.18));
            dx += force.delta.x * weight; dy += force.delta.y * weight;
          }
          if (audit.crossingEdges.includes(edge.id)) {
            const near = audit.crossings.some(p => distance(point, p) < cellSide * 0.18);
            if (near) {
              const average = mix(points[index - 1], points[index + 1], 0.5);
              dx += (average.x - point.x) * 0.35; dy += (average.y - point.y) * 0.35;
            }
          }
          const candidate = { x: Math.max(0, Math.min(1, point.x + dx * strength)),
            y: Math.max(0, Math.min(1, point.y + dy * strength)) };
          const displacement = distance(candidate, original[index]), limit = maxMovement * cellSide;
          const bounded = displacement > limit ? mix(original[index], candidate, limit / displacement) : candidate;
          return bounded;
        });
        replacements.set(edge.id, moved);
      }
      if (!replacements.size) break;
      const candidateBaked = encodeBakedCut(replaceEdges(topology, replacements, tension), tension);
      const candidate = decodeBakedCut(candidateBaked), candidateAudit = auditCut(candidate, options);
      // Quantization must also respect the displacement budget.
      let actualMovement = 0;
      for (const edge of candidate.edges) edgePoints(edge).forEach((p, i) => {
        actualMovement = Math.max(actualMovement, distance(p, originals.get(edge.id)![i]));
      });
      if (actualMovement > maxMovement * cellSide + Math.SQRT2 / 65535) continue;
      if (candidateAudit.topologyErrors.length === 0 && candidateAudit.crossings.length <= audit.crossings.length &&
          candidateAudit.oddAreas.length <= audit.oddAreas.length && score(candidateAudit, requiredGap) < score(audit, requiredGap) - 1e-7) {
        topology = candidate; baked = candidateBaked; audit = candidateAudit;
        movement = actualMovement; replacements.forEach((_, key) => changedEdges.add(key)); improved = true; break;
      }
    }
    if (!improved) break;
  }
  // Rotations use the exact decoder the app uses. A failed rotation blocks
  // publication rather than quietly accepting only the unrotated candidate.
  if (audit.clean && input.rows === input.columns) for (const turns of [1, 2, 3] as const) {
    const rotated = auditCut(decodeBakedCut(baked, turns), options);
    if (!rotated.clean) { audit = rotated; break; }
  }
  return { accepted: audit.clean, ...(audit.clean ? { baked } : {}), topology, before, audit,
    repair: { passes, changedEdges: [...changedEdges], maxMovement: movement / cellSide } };
}

export type BakedCutAcceptanceOptions = CutAuditOptions & {
  /** Existing complex styles keep thickness/angle findings for visual review. */
  policy?: 'full' | 'partition';
};

export function assertBakedCutAccepted(baked: BakedCut, options: BakedCutAcceptanceOptions = {}): CutAudit[] {
  const audits: CutAudit[] = [];
  for (const turns of (baked.rows === baked.columns ? [0, 1, 2, 3] : [0, 2]) as (0 | 1 | 2 | 3)[]) {
    const audit = auditCut(decodeBakedCut(baked, turns), options);
    const valid = options.policy === 'partition' ? hasValidCutPartition(audit) : audit.clean;
    if (!valid) throw new Error(`Rejected baked cut: ${audit.crossings.length} crossings, ${audit.pinches.length} narrow pieces, ${audit.sharpCorners.length} sharp corners, ${audit.oddAreas.length} area outliers, ${audit.topologyErrors.length} topology errors (rotation ${turns})`);
    audits.push(audit);
  }
  return audits;
}
