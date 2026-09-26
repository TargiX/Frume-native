import { describe, expect, it } from 'vitest';
import livingCusp from '../../../../assets/cuts/living-spectrum/5x5/1.json';
import crystalTip from '../../../../assets/cuts/crystal-six/4x4/2.json';
import amoeba from '../../../../assets/cuts/amoeba-coral/3x3/0.json';
import { decodeBakedCut, type BakedCut } from './bakedCut';
import { prepareComplexCut } from './prepareComplexCut';

describe('correction preserves complex cut character', { timeout: 30_000 }, () => {
  it('removes the recorded Living cusp with sub-percent movement and stable seam length', () => {
    const input = livingCusp as unknown as BakedCut, original = JSON.stringify(input);
    const result = prepareComplexCut(input);
    expect(result.accepted, result.rejectionReasons.join(', ')).toBe(true);
    expect(result.before.pinches.length).toBeGreaterThan(0);
    expect(result.audit.pinches).toHaveLength(0);
    expect(result.shapeChange!.maximumCurveMovement).toBeLessThan(0.002);
    expect(result.shapeChange!.seamLengthRatio).toBeGreaterThan(0.999);
    expect(result.shapeChange!.seamLengthRatio).toBeLessThan(1.001);
    expect(JSON.stringify(input)).toBe(original);
  });
  it('preserves the pointed Crystal junction while fixing an unrelated cusp', () => {
    const input = crystalTip as unknown as BakedCut;
    const original = decodeBakedCut(input);
    const result = prepareComplexCut(input);
    expect(result.accepted, result.rejectionReasons.join(', ')).toBe(true);
    expect(result.audit.junctionTips.some(p => p.piece === 9)).toBe(true);
    for (const id of ['shared-7-9-0', 'shared-4-9-0']) {
      expect(result.topology.edges.find(edge => edge.id === id)).toEqual(original.edges.find(edge => edge.id === id));
    }
    expect(result.shapeChange!.changedEdges).toEqual(['shared-1-3-0']);
  });
  it('preserves a non-default stored spline tension', () => {
    const input = { ...amoeba, tension: 0.25 } as unknown as BakedCut;
    const result = prepareComplexCut(input);
    expect(result.accepted, result.rejectionReasons.join(', ')).toBe(true);
    expect(result.baked!.tension).toBe(0.25);
    expect(result.shapeChange!.changedKnots).toBe(0);
    expect(result.baked).toBe(input);
  });
  it('withholds malformed topology even if shape repair is enabled', () => {
    const input = JSON.parse(JSON.stringify(amoeba)) as BakedCut;
    input.edges.find(edge => !edge.exterior)!.ownerIds = ['missing', 'missing'];
    expect(prepareComplexCut(input).baked).toBeUndefined();
  });
});
