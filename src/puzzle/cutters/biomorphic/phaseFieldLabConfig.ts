export type BiomorphicPhaseFieldStyle = "dendrite" | "amoeba";

/**
 * How the initial piece sites are laid out before the generalized Voronoi
 * step. The paper treats seed generation as part of the cut style: the same
 * solver over blue-noise, columnar, or lattice seeds yields visibly different
 * families of pieces.
 */
export type BiomorphicSeedLayoutMode = "blue-noise" | "jittered-grid" | "grid";

export type BiomorphicSeedLayout = {
  mode: BiomorphicSeedLayoutMode;
  /**
   * Cell aspect. Values above 1 weight vertical separation more heavily, so
   * sites spread apart in y and the cells come out wide and short; values
   * below 1 do the reverse and give columnar pieces. 1 is isotropic.
   */
  stretch: number;
  /**
   * Random displacement away from the exact lattice site, as a fraction of a
   * cell. Ignored by "grid"; for "blue-noise" it scales the border inset.
   */
  jitter: number;
};

export const BIOMORPHIC_SEED_LAYOUT_MODES: readonly BiomorphicSeedLayoutMode[] =
  ["blue-noise", "jittered-grid", "grid"];

/**
 * Kobayashi's anisotropic surface energy: the interface costs less to build
 * along some directions than others, so tips prefer a fixed number of compass
 * headings instead of growing equally every way. Each piece gets its own
 * crystal orientation, which also breaks the stamped-from-one-template look.
 * The paper lists this as future work, so it is our own family of cut, not a
 * reproduction of theirs.
 */
export type BiomorphicAnisotropy = {
  /** Modulation depth of epsilon(theta). Zero disables the whole term. */
  delta: number;
  /** Rotational symmetry: 4 for cross-like tips, 6 for snowflake-like. */
  symmetry: number;
};

export type BiomorphicPhaseFieldProfile = {
  iterations: number;
  interfaceEpsilon: number;
  supercooling: number;
  gamma: number;
  alpha: number;
  latentHeat: number;
  areaConservation: number;
  /**
   * Rate at which each phase's temperature is pulled back toward "supercooled
   * where I am, superheated where I am not", tracking the front as it moves.
   * This is the infinite quench bath real dendrites grow into: without it the
   * temperature field simply equalizes, the driving force decays to zero, and
   * the fringe is smoothed away long before the piece outline has had time to
   * evolve. Zero recovers the closed, self-exhausting system.
   */
  bathCoupling: number;
  /**
   * Amplitude of a frozen spatial disorder field added to each phase's driving
   * force at its interface. A perfectly periodic seed amplifies into an evenly
   * spaced comb and stops; disorder gives every tip its own history, so a tip
   * that widens loses stability again and splits. That is what turns one row of
   * teeth into the large-lobe-carrying-smaller-lobes hierarchy. Deterministic:
   * the field is hashed from the run seed.
   */
  tipNoise: number;
  anisotropy: BiomorphicAnisotropy;
  /**
   * Spread of the edge perturbation between seams, as a fraction. Every seam
   * draws its own wavelengths and amplitudes from this spread, so pieces stop
   * looking pressed from one template. The paper varies parameters per region
   * of the puzzle for the same reason.
   */
  pieceVariation: number;
  /**
   * How many harmonics the edge perturbation carries, spread geometrically
   * from lambda1 down to lambda2. Two reproduces the paper's gross-plus-fine
   * pair; more fills the octaves between them, which reads as natural
   * roughness rather than as two audible tones.
   */
  spectrumHarmonics: number;
  /**
   * Amplitude exponent across that spectrum: u(lambda) = u1 * (lambda/lambda1)^falloff.
   * One keeps the slope constant across scales, the self-affine case, and
   * reproduces the stock u1/u2 pair exactly. Zero makes every octave equally
   * loud, above one damps the short waves.
   */
  spectrumFalloff: number;
  /**
   * Width of free melt left around the board, as a fraction of a piece. The
   * border pieces have nothing to push against there, so they grow outward
   * into it and the puzzle's outer edge ends up grown rather than guillotined
   * to a rectangle. Zero keeps the hard rectangular board.
   */
  freeRim: number;
  /**
   * Narrowest tab the cut may keep, as a fraction of a piece. Anything thinner
   * is shaved off and handed to the neighbour after the solve, which is where
   * the paper does its own removal of too-thin sections.
   *
   * At 6% of a piece this takes Living from 14 pieces of 16 carrying a place
   * under four samples wide down to 3, without visibly coarsening the cut. The
   * radius follows the piece, so the same figure means the same thing at any
   * resolution.
   */
  minNeck: number;
  lambda1: number;
  u1: number;
  lambda2: number;
  u2: number;
  warpWavelengths: [number, number];
  warpAmplitudes: [number, number];
  seedLayout: BiomorphicSeedLayout;
};

export type BiomorphicPhaseFieldNumerics = {
  samplesPerPiece: number;
  dx: number;
  dt: number;
  tau: number;
  activeThreshold: number;
  boundingBoxMargin: number;
  thermalBoxMargin: number;
  connectivityRadius: number;
  topologyProjectionEvery: number;
  smoothingPasses: number;
};

export type BiomorphicPhaseFieldLabSettings = {
  name: string;
  seed: string;
  rows: number;
  columns: number;
  style: BiomorphicPhaseFieldStyle;
  captureEvery: number;
  frameDurationMs: number;
  profile: BiomorphicPhaseFieldProfile;
  numerics: BiomorphicPhaseFieldNumerics;
};

export const BIOMORPHIC_PHASE_FIELD_PROFILES: Record<
  BiomorphicPhaseFieldStyle,
  BiomorphicPhaseFieldProfile
> = {
  dendrite: {
    // The fringe is fully formed here; past roughly 500 the lobes merge back
    // into bland bends, the melting the paper itself reports for long runs.
    iterations: 300,
    interfaceEpsilon: 0.008,
    supercooling: 0.3,
    gamma: 35,
    alpha: 0.95,
    // The paper's K. The former value of 4 was tuned against the inverted
    // enthalpy sign; with the corrected sign it over-damps the front into
    // pure curvature smoothing and nothing grows at all.
    latentHeat: 1,
    bathCoupling: 0,
    tipNoise: 0,
    anisotropy: { delta: 0, symmetry: 6 },
    pieceVariation: 0,
    spectrumHarmonics: 2,
    spectrumFalloff: 1,
    freeRim: 0,
    minNeck: 0.06,
    // Off. This volume pressure is not in the paper: it adds a per-piece
    // uniform boost to the driving force, which is exactly the kind of
    // non-local correction that stops a fringe growing evenly. It existed to
    // stop pieces shrinking apart while the temperature field was diverging;
    // with the enthalpy sign fixed, pieces stay connected and hole-free
    // without it and the cut is visually identical.
    areaConservation: 0,
    lambda1: 20,
    u1: 8,
    lambda2: 2,
    u2: 1,
    warpWavelengths: [128, 70],
    warpAmplitudes: [13, 8],
    seedLayout: { mode: "blue-noise", stretch: 1, jitter: 0.34 },
  },
  amoeba: {
    iterations: 800,
    // Half a cell of interface instead of a third: enough capillary length to
    // damp the sub-lambda2 roughness the thinner interface left ragged.
    interfaceEpsilon: 0.012,
    supercooling: 0.3,
    gamma: 35,
    alpha: 0.9,
    latentHeat: 1,
    bathCoupling: 0,
    tipNoise: 0,
    anisotropy: { delta: 0, symmetry: 6 },
    pieceVariation: 0,
    spectrumHarmonics: 2,
    spectrumFalloff: 1,
    freeRim: 0,
    minNeck: 0.06,
    // Off, for the same reason as Living.
    areaConservation: 0,
    lambda1: 40,
    u1: 8,
    lambda2: 4,
    // The paper's published Amoeba uses U2 = 2. This was halved back when the
    // enthalpy sign was inverted and the fine buds were being erased; it has
    // not been re-tested since the sign was fixed.
    u2: 1,
    warpWavelengths: [94, 50],
    warpAmplitudes: [12, 8],
    seedLayout: { mode: "blue-noise", stretch: 1, jitter: 0.34 },
  },
};

export const BIOMORPHIC_PHASE_FIELD_NUMERICS: BiomorphicPhaseFieldNumerics = {
  samplesPerPiece: 176,
  dx: 0.024,
  // Explicit 5-point diffusion is stable only while dt <= 0.25 * dx^2, i.e.
  // 1.44e-4 here. The previous 1.5e-4 sat just above that limit, so the
  // temperature field grew a checkerboard mode by ~8% per step and stopped
  // being a temperature after roughly 150 iterations.
  dt: 0.00012,
  tau: 0.0003,
  activeThreshold: 1e-4,
  boundingBoxMargin: 4,
  thermalBoxMargin: 24,
  connectivityRadius: 2,
  // Keep every physical step on the valid puzzle-piece topology. These cuts
  // are intended to be baked, so correctness wins over transient solve time.
  topologyProjectionEvery: 1,
  smoothingPasses: 1,
};

function cloneProfile(
  profile: BiomorphicPhaseFieldProfile,
): BiomorphicPhaseFieldProfile {
  return {
    ...profile,
    warpWavelengths: [...profile.warpWavelengths],
    warpAmplitudes: [...profile.warpAmplitudes],
    seedLayout: { ...profile.seedLayout },
    anisotropy: { ...profile.anisotropy },
  };
}

export function createPhaseFieldLabSettings(
  style: BiomorphicPhaseFieldStyle = "dendrite",
): BiomorphicPhaseFieldLabSettings {
  return {
    name: style === "dendrite" ? "Living study" : "Amoeba study",
    seed: "frume-lab-01",
    rows: 4,
    columns: 4,
    style,
    captureEvery: 25,
    frameDurationMs: 120,
    profile: cloneProfile(BIOMORPHIC_PHASE_FIELD_PROFILES[style]),
    numerics: {
      ...BIOMORPHIC_PHASE_FIELD_NUMERICS,
      // Interactive playback deliberately starts lighter than the bake
      // profile. The saved preset still carries the exact chosen resolution.
      samplesPerPiece: 42,
      // The lab exposes every physical step, so topology must remain valid at
      // every frame rather than only at production bake checkpoints.
      topologyProjectionEvery: 1,
    },
  };
}

function assertFinite(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  integer = false,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? "an integer" : "a number"} between ${minimum} and ${maximum}`,
    );
  }
}

export function parsePhaseFieldLabSettings(
  value: unknown,
): BiomorphicPhaseFieldLabSettings {
  if (!value || typeof value !== "object") {
    throw new Error("Preset must be a JSON object");
  }
  const candidate = value as Partial<BiomorphicPhaseFieldLabSettings>;
  if (candidate.style !== "dendrite" && candidate.style !== "amoeba") {
    throw new Error('style must be "dendrite" or "amoeba"');
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new Error("name must be a non-empty string");
  }
  if (typeof candidate.seed !== "string" || !candidate.seed.trim()) {
    throw new Error("seed must be a non-empty string");
  }
  assertFinite(candidate.rows, "rows", 2, 8, true);
  assertFinite(candidate.columns, "columns", 2, 8, true);
  assertFinite(candidate.captureEvery, "captureEvery", 1, 1000, true);
  assertFinite(candidate.frameDurationMs, "frameDurationMs", 16, 5000, true);

  const profile = candidate.profile;
  const numerics = candidate.numerics;
  if (!profile || typeof profile !== "object") {
    throw new Error("profile is required");
  }
  if (!numerics || typeof numerics !== "object") {
    throw new Error("numerics is required");
  }

  assertFinite(profile.iterations, "iterations", 1, 20_000, true);
  assertFinite(profile.interfaceEpsilon, "interfaceEpsilon", 0.0001, 0.1);
  assertFinite(profile.supercooling, "supercooling", 0.001, 2);
  assertFinite(profile.gamma, "gamma", 0.01, 500);
  assertFinite(profile.alpha, "alpha", 0.01, 2);
  assertFinite(profile.latentHeat, "latentHeat", 0, 10);
  assertFinite(profile.areaConservation, "areaConservation", 0, 10);
  assertFinite(profile.bathCoupling, "bathCoupling", 0, 500);
  assertFinite(profile.tipNoise, "tipNoise", 0, 2);
  assertFinite(profile.pieceVariation, "pieceVariation", 0, 1);
  assertFinite(profile.spectrumHarmonics, "spectrumHarmonics", 1, 8, true);
  assertFinite(profile.spectrumFalloff, "spectrumFalloff", 0, 3);
  assertFinite(profile.freeRim, "freeRim", 0, 0.5);
  assertFinite(profile.minNeck, "minNeck", 0, 0.25);
  const anisotropy = profile.anisotropy;
  if (!anisotropy || typeof anisotropy !== "object") {
    throw new Error("anisotropy is required");
  }
  assertFinite(anisotropy.delta, "anisotropy.delta", 0, 1);
  if (anisotropy.symmetry !== 4 && anisotropy.symmetry !== 6) {
    throw new Error("anisotropy.symmetry must be 4 or 6");
  }
  assertFinite(profile.lambda1, "lambda1", 0.1, 1000);
  assertFinite(profile.u1, "u1", 0, 1000);
  assertFinite(profile.lambda2, "lambda2", 0.1, 1000);
  assertFinite(profile.u2, "u2", 0, 1000);
  if (
    !Array.isArray(profile.warpWavelengths) ||
    profile.warpWavelengths.length !== 2
  ) {
    throw new Error("warpWavelengths must contain two numbers");
  }
  if (
    !Array.isArray(profile.warpAmplitudes) ||
    profile.warpAmplitudes.length !== 2
  ) {
    throw new Error("warpAmplitudes must contain two numbers");
  }
  profile.warpWavelengths.forEach((entry, index) =>
    assertFinite(entry, `warpWavelengths[${index}]`, 0.1, 5000),
  );
  profile.warpAmplitudes.forEach((entry, index) =>
    assertFinite(entry, `warpAmplitudes[${index}]`, 0, 1000),
  );

  const seedLayout = profile.seedLayout;
  if (!seedLayout || typeof seedLayout !== "object") {
    throw new Error("seedLayout is required");
  }
  if (!BIOMORPHIC_SEED_LAYOUT_MODES.includes(seedLayout.mode)) {
    throw new Error(
      `seedLayout.mode must be one of ${BIOMORPHIC_SEED_LAYOUT_MODES.join(", ")}`,
    );
  }
  assertFinite(seedLayout.stretch, "seedLayout.stretch", 0.2, 5);
  assertFinite(seedLayout.jitter, "seedLayout.jitter", 0, 1);

  assertFinite(numerics.samplesPerPiece, "samplesPerPiece", 12, 256, true);
  assertFinite(numerics.dx, "dx", 0.00001, 1);
  assertFinite(numerics.dt, "dt", 0.00000001, 1);
  assertFinite(numerics.tau, "tau", 0.00000001, 1);
  assertFinite(numerics.activeThreshold, "activeThreshold", 0.00000001, 0.25);
  assertFinite(numerics.boundingBoxMargin, "boundingBoxMargin", 1, 128, true);
  assertFinite(numerics.thermalBoxMargin, "thermalBoxMargin", 1, 512, true);
  assertFinite(numerics.connectivityRadius, "connectivityRadius", 0, 12, true);
  assertFinite(
    numerics.topologyProjectionEvery,
    "topologyProjectionEvery",
    1,
    1000,
    true,
  );
  assertFinite(numerics.smoothingPasses, "smoothingPasses", 0, 4, true);

  return {
    name: candidate.name.trim(),
    seed: candidate.seed.trim(),
    rows: candidate.rows,
    columns: candidate.columns,
    style: candidate.style,
    captureEvery: candidate.captureEvery,
    frameDurationMs: candidate.frameDurationMs,
    profile: cloneProfile(profile as BiomorphicPhaseFieldProfile),
    numerics: { ...(numerics as BiomorphicPhaseFieldNumerics) },
  };
}

export function serializePhaseFieldLabSettings(
  settings: BiomorphicPhaseFieldLabSettings,
): string {
  return JSON.stringify(parsePhaseFieldLabSettings(settings), null, 2);
}
