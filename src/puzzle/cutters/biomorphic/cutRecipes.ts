import { BIOMORPHIC_PHASE_FIELD_NUMERICS, BIOMORPHIC_PHASE_FIELD_PROFILES, type BiomorphicPhaseFieldLabSettings } from './phaseFieldLabConfig';

/** Experimental recipes. Versioned independently of the installed library. */
export const CUT_RECIPES = {
  'organic-v1': { base: 'dendrite', duration: 0.027, interfaceWidth: 0.008 / 0.576,
    wavelengths: [20 / 48, 4 / 48], amplitudes: [8 / 48, 1 / 48] },
  'rounded-v1': { base: 'amoeba', duration: 0.036, interfaceWidth: 0.012 / 0.576,
    wavelengths: [40 / 48, 4 / 48], amplitudes: [8 / 48, 2 / 48] },
} as const;
export type CutRecipeId = keyof typeof CUT_RECIPES;
/** Offline boards may exceed the interactive lab's size/frame limits. */
export type ResolvedCutRecipe = Pick<BiomorphicPhaseFieldLabSettings,
  'name' | 'seed' | 'rows' | 'columns' | 'style' | 'profile' | 'numerics'>;

/**
 * Style lengths are fractions of a piece, solver lengths are physical, and
 * raster lengths are samples. Refinement holds piece size and duration fixed.
 * It does not claim convergence: raster initialization/cleanup still need
 * comparison on the same seed at each resolution.
 */
export function resolveCutRecipe(id: CutRecipeId, rows: number, columns: number,
  seed: string, samplesPerPiece = 48): ResolvedCutRecipe {
  if (!CUT_RECIPES[id]) throw new Error(`Unknown cut recipe: ${id}`);
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 ||
      !seed.trim() || !Number.isInteger(samplesPerPiece) || samplesPerPiece < 48 || samplesPerPiece > 192) {
    throw new Error('Recipe requires positive dimensions, an explicit seed, and 48–192 samples per piece');
  }
  const recipe = CUT_RECIPES[id], source = BIOMORPHIC_PHASE_FIELD_PROFILES[recipe.base];
  const scale = samplesPerPiece / 48, pieceLength = 0.576;
  const maximumDt = 0.00003 / (scale * scale), iterations = Math.ceil(recipe.duration / maximumDt - 1e-8);
  return {
    name: id, seed, rows, columns, style: recipe.base,
    profile: {
      ...source, iterations, interfaceEpsilon: recipe.interfaceWidth * pieceLength,
      alpha: 0.9, lambda1: recipe.wavelengths[0] * samplesPerPiece, lambda2: recipe.wavelengths[1] * samplesPerPiece,
      u1: recipe.amplitudes[0] * samplesPerPiece, u2: recipe.amplitudes[1] * samplesPerPiece,
      warpWavelengths: source.warpWavelengths.map(v => v * scale) as [number, number],
      warpAmplitudes: source.warpAmplitudes.map(v => v * scale) as [number, number],
      seedLayout: { ...source.seedLayout }, anisotropy: { ...source.anisotropy },
    },
    numerics: {
      ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece, dx: pieceLength / samplesPerPiece,
      dt: recipe.duration / iterations, isotropicStencil: false,
      boundingBoxMargin: Math.ceil(4 * scale), thermalBoxMargin: Math.ceil(24 * scale),
      connectivityRadius: Math.ceil(2 * scale), topologyProjectionEvery: Math.max(1, Math.round(scale * scale)),
    },
  };
}
