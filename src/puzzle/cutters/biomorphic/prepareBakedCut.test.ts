import { describe, expect, it } from 'vitest';
import { auditCut } from './auditCut';
import { decodeBakedCut, type BakedCut } from './bakedCut';
import boundaryNeck from './__fixtures__/boundary-neck.json';
import installedLiving from '../../../../assets/cuts/living-fringe/5x5/0.json';
import { createBiomorphicTopology } from './generateBiomorphic';
import { assertBakedCutAccepted, prepareBakedCut } from './prepareBakedCut';
import { splitBoard } from './cutTestFixtures';

describe('baked cut acceptance', () => {
  it('preserves an installed Living cut while reporting its fine fringe for review', () => {
    const baked = installedLiving as unknown as BakedCut;
    const snapshot = JSON.stringify(baked);
    // The installed bake path must not silently round the whole style to meet
    // a thickness threshold selected for a separate broad-lobed experiment.
    expect(() => assertBakedCutAccepted(baked, { policy: 'partition' })).not.toThrow();
    expect(auditCut(decodeBakedCut(baked)).pinches.length).toBeGreaterThan(0);
    expect(() => assertBakedCutAccepted(baked)).toThrow(/narrow pieces/);
    expect(JSON.stringify(baked)).toBe(snapshot);
  });
  it('still blocks a broken partition when preserving complex style details', () => {
    const broken = JSON.parse(JSON.stringify(installedLiving)) as BakedCut;
    broken.edges.find(edge => !edge.exterior)!.ownerIds = ['missing', 'missing'];
    expect(() => assertBakedCutAccepted(broken, { policy: 'partition' })).toThrow(/topology errors/);
  });
  it('continues a boundary repair through the curve approximation allowance', () => {
    // Saved Organic cut-study-05, 25 pieces. The measured width reaches 6%
    // before the conservative 6.1% gate, so progress must include that margin.
    // JSON imports widen the fixed traversal tuples to number arrays.
    const result = prepareBakedCut(decodeBakedCut(boundaryNeck as unknown as BakedCut));
    expect(result.accepted).toBe(true);
    expect(result.audit.pinches).toHaveLength(0);
  });
  it('validates the actual decoded payload and all rotations without mutating input', () => {
    const topology = createBiomorphicTopology(3, 3, 'gate');
    const snapshot = JSON.stringify(topology);
    const result = prepareBakedCut(topology);
    expect(result.accepted).toBe(true);
    expect(result.baked).toBeDefined();
    expect(JSON.stringify(topology)).toBe(snapshot);
    for (const rotation of [0, 1, 2, 3] as const) expect(auditCut(decodeBakedCut(result.baked!, rotation)).clean).toBe(true);
    expect(() => assertBakedCutAccepted(result.baked!)).not.toThrow();
  });
  it('withholds a payload when ownership is invalid', () => {
    const topology = createBiomorphicTopology(3, 3, 'gate');
    topology.edges.find(e => !e.exterior)!.ownerIds = ['missing', 'missing'];
    const result = prepareBakedCut(topology);
    expect(result.accepted).toBe(false);
    expect(result.baked).toBeUndefined();
    expect(result.audit.topologyErrors.length).toBeGreaterThan(0);
  });

  it('opens a narrow neck by moving the shared seam within its budget', () => {
    const topology = splitBoard([
      { x: 0.5, y: 0 }, { x: 0.5, y: 0.25 }, { x: 0.5, y: 0.4 },
      { x: 0.56, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.3 },
      { x: 0.75, y: 0.3 }, { x: 0.8, y: 0.35 }, { x: 0.8, y: 0.5 },
      { x: 0.75, y: 0.55 }, { x: 0.6, y: 0.55 }, { x: 0.6, y: 0.42 },
      { x: 0.56, y: 0.42 }, { x: 0.5, y: 0.42 }, { x: 0.5, y: 0.7 }, { x: 0.5, y: 1 },
    ]);
    const blocked = prepareBakedCut(topology, { maxPasses: 0 });
    expect(blocked.accepted).toBe(false);
    expect(blocked.baked).toBeUndefined();
    const result = prepareBakedCut(topology);
    expect(result.accepted, JSON.stringify(result.audit)).toBe(true);
    expect(result.repair.passes).toBeGreaterThan(0);
    expect(result.repair.maxMovement).toBeLessThanOrEqual(0.06 + Math.SQRT2 / 65535 / 0.5);
    expect(result.repair.changedEdges).toEqual(['seam']);
    expect(result.topology.edges.filter(e => e.exterior)).toEqual(blocked.topology.edges.filter(e => e.exterior));
    const left = result.topology.cells[0].edgeTraversals.find(t => t.edge.id === 'seam')!;
    const right = result.topology.cells[1].edgeTraversals.find(t => t.edge.id === 'seam')!;
    expect(left.edge).toBe(right.edge);
    expect(left.direction).toBe(-right.direction);
  });
});
