import { CUT_STYLES, type CutStyle } from './cutStyles';

export type CutBakeGrid = readonly [rows: number, columns: number, variants: number];
export const DEFAULT_CUT_BAKE_GRIDS: readonly CutBakeGrid[] = [
  [3, 3, 8], [4, 4, 8], [5, 5, 8], [7, 7, 4],
];

/** Custom batches stay in staging: enlarging a live pool changes seed modulo. */
export function resolveCutBakePlan(options: {
  grids?: string;
  styles?: string;
  seedOffset?: string;
  staging: boolean;
}): { grids: readonly CutBakeGrid[]; styles: readonly CutStyle[]; seedOffset: number } {
  const customized = options.grids !== undefined || options.styles !== undefined || options.seedOffset !== undefined;
  if (customized && !options.staging) throw new Error('Custom bake plans require FRUME_BAKE_OUT in a staging directory');
  const grids: unknown = options.grids === undefined ? DEFAULT_CUT_BAKE_GRIDS : JSON.parse(options.grids);
  if (!Array.isArray(grids) || !grids.length || grids.some(grid =>
    !Array.isArray(grid) || grid.length !== 3 || grid.some(n => !Number.isSafeInteger(n) || n < 1))) {
    throw new Error('FRUME_BAKE_GRIDS must contain [rows, columns, positive variant count] entries');
  }
  if (new Set(grids.map(grid => `${grid[0]}x${grid[1]}`)).size !== grids.length) throw new Error('Duplicate bake grid');
  const ids = options.styles?.split(',').map(id => id.trim());
  if (ids && (new Set(ids).size !== ids.length || ids.some(id => !CUT_STYLES.some(style => style.id === id)))) {
    throw new Error('FRUME_BAKE_STYLES contains an unknown or duplicate style');
  }
  const styles = ids ? CUT_STYLES.filter(style => ids.includes(style.id)) : CUT_STYLES;
  const seedOffset = options.seedOffset === undefined ? 0 : Number(options.seedOffset);
  if (options.seedOffset === '' || !Number.isSafeInteger(seedOffset) || seedOffset < 0 ||
      grids.some(grid => !Number.isSafeInteger(seedOffset + grid[2]))) throw new Error('Invalid FRUME_BAKE_SEED_OFFSET');
  return { grids: grids as unknown as CutBakeGrid[], styles, seedOffset };
}
