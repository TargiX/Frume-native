import {
  BIOMORPHIC_PHASE_FIELD_PROFILES,
  type BiomorphicPhaseFieldProfile,
} from "./phaseFieldLabConfig";

/**
 * The cut styles the product ships, as opposed to the whole space the lab can
 * explore.
 *
 * A style earns a place here only if the *character of a piece* changes.
 * Rearranging where the seeds land reads as the same style with a different
 * seed, because that is what it is. Three levers change character, and every
 * style below is one of them turned:
 *
 *  - where the perturbation sits relative to the unstable band, measured at
 *    8 to 16 samples: harmonics inside it grow into teeth, outside it they are
 *    erased;
 *  - anisotropy, which makes tips prefer four or six headings per piece;
 *  - interface width, which decides how fine a tooth can get before surface
 *    tension damps it.
 *
 * See CUT_STYLES.md for the measurements and for the candidates not built yet.
 */

export type CutStyleId =
  | "living-fringe"
  | "living-spectrum"
  | "crystal-six"
  | "crystal-four"
  | "amoeba-coral"
  | "amoeba-columnar";

export type CutStyle = {
  id: CutStyleId;
  name: string;
  summary: string;
  profile: BiomorphicPhaseFieldProfile;
  /**
   * Baking resolution. The unstable band is an absolute count of samples, so a
   * style only reproduces the cut it was chosen for at the resolution it was
   * chosen at.
   */
  samplesPerPiece: number;
};

function style(
  id: CutStyleId,
  name: string,
  summary: string,
  base: "dendrite" | "amoeba",
  samplesPerPiece: number,
  patch: (profile: BiomorphicPhaseFieldProfile) => void,
): CutStyle {
  const source = BIOMORPHIC_PHASE_FIELD_PROFILES[base];
  const profile: BiomorphicPhaseFieldProfile = {
    ...source,
    warpWavelengths: [...source.warpWavelengths],
    warpAmplitudes: [...source.warpAmplitudes],
    seedLayout: { ...source.seedLayout },
    anisotropy: { ...source.anisotropy },
  };
  patch(profile);
  return { id, name, summary, profile, samplesPerPiece };
}

/** Both harmonics inside the measured unstable band, run until it saturates. */
function tunedFringe(profile: BiomorphicPhaseFieldProfile, noise: number) {
  profile.lambda1 = 16;
  profile.lambda2 = 8;
  profile.u1 = 6;
  profile.u2 = 3;
  profile.tipNoise = noise;
  // The boundary has all but stopped gaining length by 3000 steps.
  profile.iterations = 3000;
}

export const CUT_STYLES: readonly CutStyle[] = [
  style(
    "living-fringe",
    "Living",
    "An even fringe of fine teeth over blue-noise pieces.",
    "dendrite",
    96,
    (profile) => tunedFringe(profile, 0.05),
  ),
  style(
    "living-spectrum",
    "Living spectrum",
    "Five harmonics filling the octaves instead of two tones, seams varied.",
    "dendrite",
    96,
    (profile) => {
      tunedFringe(profile, 0.05);
      profile.spectrumHarmonics = 5;
      profile.pieceVariation = 0.5;
    },
  ),
  style(
    "crystal-six",
    "Crystal",
    "Tips prefer six headings, each piece rotated its own way.",
    "dendrite",
    96,
    (profile) => {
      tunedFringe(profile, 0.08);
      profile.anisotropy = { delta: 0.3, symmetry: 6 };
    },
  ),
  style(
    "crystal-four",
    "Crystal quartered",
    "The same on four headings and deeper: blockier, more mineral.",
    "dendrite",
    96,
    (profile) => {
      tunedFringe(profile, 0.08);
      profile.anisotropy = { delta: 0.5, symmetry: 4 };
    },
  ),
  style(
    "amoeba-coral",
    "Amoeba",
    "A thicker interface and longer waves: fewer, rounder, coral-like lobes.",
    "amoeba",
    96,
    () => {},
  ),
  style(
    "amoeba-columnar",
    "Amoeba columnar",
    "Amoeba over sites stretched into columns, giving tall banded pieces.",
    "amoeba",
    96,
    (profile) => {
      profile.seedLayout = { mode: "blue-noise", stretch: 0.5, jitter: 0.34 };
    },
  ),
];

export function getCutStyle(id: CutStyleId): CutStyle {
  const found = CUT_STYLES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown cut style "${id}"`);
  return found;
}
