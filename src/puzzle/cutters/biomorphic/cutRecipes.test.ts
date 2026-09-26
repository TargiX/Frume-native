import { describe, expect, it } from 'vitest';
import { resolveCutRecipe } from './cutRecipes';

describe('experimental cut recipes', () => {
  it.each(['organic-v1', 'rounded-v1'] as const)('preserves the physical problem when refining %s', id => {
    const a = resolveCutRecipe(id, 5, 5, 'same', 48), b = resolveCutRecipe(id, 5, 5, 'same', 96);
    expect(a.numerics.dx * 48).toBeCloseTo(b.numerics.dx * 96, 12);
    expect(a.profile.iterations * a.numerics.dt).toBeCloseTo(b.profile.iterations * b.numerics.dt, 12);
    expect(a.profile.interfaceEpsilon).toBe(b.profile.interfaceEpsilon);
    expect(a.profile.lambda1 / 48).toBe(b.profile.lambda1 / 96);
    expect(a.profile.u2 / 48).toBe(b.profile.u2 / 96);
    expect(a.profile.warpWavelengths[0] * a.numerics.dx).toBeCloseTo(b.profile.warpWavelengths[0] * b.numerics.dx, 12);
    expect(a.numerics.thermalBoxMargin * a.numerics.dx).toBeCloseTo(b.numerics.thermalBoxMargin * b.numerics.dx, 12);
    expect(b.numerics.dt / b.numerics.dx ** 2).toBeLessThan(0.25);
    expect(a.seed).toBe(b.seed);
  });
  it('requires a seed and leaves other resolved recipes immutable', () => {
    expect(() => resolveCutRecipe('organic-v1', 5, 5, '')).toThrow(/explicit seed/);
    const first = resolveCutRecipe('organic-v1', 5, 5, 'same');
    first.profile.warpWavelengths[0] = 1;
    expect(resolveCutRecipe('organic-v1', 5, 5, 'same').profile.warpWavelengths[0]).toBe(128);
  });
});
