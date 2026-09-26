import { expect, it } from 'vitest';
import { encodeBakedCut } from './bakedCut';
import { resolveCutRecipe } from './cutRecipes';
import { createBiomorphicPhaseFieldTopology } from './generateBiomorphicPhaseField';

it('reproduces a recipe exactly and reports extraction without changing its result', () => {
  const settings = resolveCutRecipe('organic-v1', 3, 3, 'refinement-00');
  const original = JSON.stringify(settings);
  const attempts: { smoothingPasses: number; safe: boolean; error?: string }[] = [];
  const first = createBiomorphicPhaseFieldTopology(3, 3, settings.seed, settings.style,
    settings.profile, settings.numerics, attempt => attempts.push(attempt));
  const second = createBiomorphicPhaseFieldTopology(3, 3, settings.seed, settings.style,
    settings.profile, settings.numerics);
  expect(encodeBakedCut(first)).toEqual(encodeBakedCut(second));
  expect(attempts.length).toBeGreaterThan(0);
  expect(attempts.at(-1)?.safe).toBe(true);
  expect(JSON.stringify(settings)).toBe(original);
}, 30_000);
