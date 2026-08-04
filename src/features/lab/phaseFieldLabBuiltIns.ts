import {
  createPhaseFieldLabSettings,
  type BiomorphicPhaseFieldLabSettings,
  type BiomorphicPhaseFieldStyle,
} from "../../puzzle/cutters/biomorphic/phaseFieldLabConfig";

export type PhaseFieldLabBuiltIn = {
  id: string;
  name: string;
  /** One line on what makes this cut style look the way it does. */
  summary: string;
  settings: BiomorphicPhaseFieldLabSettings;
};

function build(
  id: string,
  name: string,
  summary: string,
  style: BiomorphicPhaseFieldStyle,
  patch: (settings: BiomorphicPhaseFieldLabSettings) => void,
): PhaseFieldLabBuiltIn {
  const settings = createPhaseFieldLabSettings(style);
  settings.name = name;
  patch(settings);
  return { id, name, summary, settings };
}

/**
 * Measured settings rather than eyeballed ones. Probing a single harmonic on a
 * straight seam showed the interface is unstable between roughly 8 and 16
 * pixels, peaking near 8: at 2000 iterations a 4 px seed grew the boundary by
 * 1.29x, 8 px by 3.07x, 16 px by 2.58x and 64 px by only 1.11x. The stock
 * lambda2 of 2 px sits below that band, which is why the fine harmonic was
 * always erased and only five or six coarse teeth per edge survived.
 *
 * The band is an absolute pixel count -- it comes from the interface width and
 * the thermal length, both fixed while dx is fixed -- so these presets pin
 * samplesPerPiece as well. Reading them at another resolution changes the cut.
 */
function tunedFringe(tipNoise: number) {
  return (settings: BiomorphicPhaseFieldLabSettings) => {
    settings.numerics.samplesPerPiece = 96;
    settings.profile.lambda1 = 16;
    settings.profile.lambda2 = 8;
    settings.profile.u1 = 6;
    settings.profile.u2 = 3;
    settings.profile.tipNoise = tipNoise;
    // The instability needs about 1500 steps to work through; past 3000 the
    // boundary length has all but stopped changing.
    settings.profile.iterations = 3000;
    settings.captureEvery = 250;
  };
}

/**
 * Starting points that ship with the lab, so a session begins from a known
 * good cut style instead of from whichever parameters were last saved. Each
 * one is a plain settings object: load it, then move any slider from there.
 */
export const PHASE_FIELD_LAB_BUILT_INS: readonly PhaseFieldLabBuiltIn[] = [
  build(
    "living-fringe",
    "Living fringe",
    "Default Living: an even fringe over blue-noise pieces, stopped before the lobes merge.",
    "dendrite",
    () => {},
  ),
  build(
    "living-early",
    "Living early",
    "Half the latent heat, stopped at 150 — shallower, rounder lobes.",
    "dendrite",
    (settings) => {
      settings.profile.latentHeat = 0.5;
      settings.profile.iterations = 150;
    },
  ),
  build(
    "living-fringe-fine",
    "Living fringe · fine",
    "Both harmonics inside the measured unstable band (8-16 px), light tip disorder.",
    "dendrite",
    tunedFringe(0.05),
  ),
  build(
    "living-fringe-wild",
    "Living fringe · wild",
    "The same band with heavy tip disorder: uneven lobes carrying smaller lobes.",
    "dendrite",
    tunedFringe(0.25),
  ),
  build(
    "living-spectrum",
    "Living spectrum",
    "Five harmonics filling the octaves instead of two audible tones, with seams varied.",
    "dendrite",
    (settings) => {
      tunedFringe(0.05)(settings);
      settings.profile.spectrumHarmonics = 5;
      settings.profile.pieceVariation = 0.5;
    },
  ),
  build(
    "crystal-six",
    "Crystal · six-fold",
    "Anisotropic surface energy: tips prefer six headings, each piece rotated its own way.",
    "dendrite",
    (settings) => {
      tunedFringe(0.08)(settings);
      settings.profile.anisotropy = { delta: 0.3, symmetry: 6 };
    },
  ),
  build(
    "crystal-four",
    "Crystal · four-fold",
    "The same, on four headings and deeper: blockier, more mineral than coral.",
    "dendrite",
    (settings) => {
      tunedFringe(0.08)(settings);
      settings.profile.anisotropy = { delta: 0.5, symmetry: 4 };
    },
  ),
  build(
    "living-lattice",
    "Living lattice",
    "The same growth over an exact square lattice instead of blue noise.",
    "dendrite",
    (settings) => {
      settings.profile.seedLayout = { mode: "grid", stretch: 1, jitter: 0 };
    },
  ),
  build(
    "amoeba-coral",
    "Amoeba coral",
    "Default Amoeba: longer run, thicker interface, cilia-like buds.",
    "amoeba",
    () => {},
  ),
  build(
    "amoeba-columnar",
    "Amoeba columnar",
    "Amoeba over sites stretched into columns, giving tall banded pieces.",
    "amoeba",
    (settings) => {
      settings.profile.seedLayout = {
        mode: "blue-noise",
        stretch: 0.5,
        jitter: 0.34,
      };
    },
  ),
  build(
    "amoeba-jittered",
    "Amoeba jittered grid",
    "Amoeba over a lattice loosened by a third of a cell — regular but not rigid.",
    "amoeba",
    (settings) => {
      settings.profile.seedLayout = {
        mode: "jittered-grid",
        stretch: 1,
        jitter: 0.55,
      };
    },
  ),
];
