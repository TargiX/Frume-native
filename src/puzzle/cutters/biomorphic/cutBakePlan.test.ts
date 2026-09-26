import { describe, expect, it } from 'vitest';
import { resolveCutBakePlan } from './cutBakePlan';
import { CUT_STYLES } from './cutStyles';

describe('existing-style bake plan', () => {
  it('keeps all six existing profiles and their established resolution', () => {
    const plan = resolveCutBakePlan({ staging: false });
    expect(plan.styles).toEqual(CUT_STYLES);
    expect(plan.styles.map(style => style.samplesPerPiece)).toEqual([96, 96, 96, 96, 96, 96]);
    expect(plan.grids).toEqual([[3, 3, 8], [4, 4, 8], [5, 5, 8], [7, 7, 4]]);
  });
  it('plans 100 and 196 pieces and fresh seed indices without changing profiles', () => {
    const plan = resolveCutBakePlan({ staging: true, grids: '[[10,10,4],[14,14,2]]', seedOffset: '8',
      styles: 'living-fringe,crystal-six,amoeba-coral' });
    expect(plan.grids).toEqual([[10, 10, 4], [14, 14, 2]]);
    expect(plan.seedOffset).toBe(8);
    expect(plan.styles.map(style => style.id)).toEqual(['living-fringe', 'crystal-six', 'amoeba-coral']);
    expect(plan.styles[0]).toBe(CUT_STYLES[0]);
  });
  it('prevents a partial or enlarged batch from rewriting the installed index', () => {
    expect(() => resolveCutBakePlan({ staging: false, grids: '[[10,10,1]]' })).toThrow(/staging/);
    expect(() => resolveCutBakePlan({ staging: false, styles: 'living-fringe' })).toThrow(/staging/);
  });
  it('rejects ambiguous or invalid generation plans', () => {
    for (const grids of ['[]', '[[10,10,0]]', '[[10,10,1],[10,10,2]]', '[[10.5,10,1]]']) {
      expect(() => resolveCutBakePlan({ staging: true, grids })).toThrow();
    }
    expect(() => resolveCutBakePlan({ staging: true, styles: 'rounded-v1' })).toThrow(/unknown/);
    expect(() => resolveCutBakePlan({ staging: true, seedOffset: '-1' })).toThrow(/OFFSET/);
  });
});
