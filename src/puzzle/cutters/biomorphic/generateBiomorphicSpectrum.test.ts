import { describe, expect, it } from "vitest";

import { runBiomorphicPhaseFieldLab } from "./generateBiomorphicPhaseField";
import { createPhaseFieldLabSettings } from "./phaseFieldLabConfig";

function study(patch: (settings: ReturnType<typeof createPhaseFieldLabSettings>) => void) {
  const settings = createPhaseFieldLabSettings("dendrite");
  settings.rows = 2;
  settings.columns = 2;
  settings.numerics.samplesPerPiece = 32;
  settings.profile.iterations = 120;
  settings.captureEvery = 120;
  patch(settings);
  return runBiomorphicPhaseFieldLab(settings);
}

describe("cut-style controls", () => {
  it("leaves the cut untouched when every new control is at its default", () => {
    // The defaults must be a no-op, or every preset saved before these controls
    // existed would silently start cutting differently.
    const base = study(() => {});
    const explicit = study((settings) => {
      settings.profile.anisotropy = { delta: 0, symmetry: 6 };
      settings.profile.pieceVariation = 0;
      settings.profile.spectrumHarmonics = 2;
      settings.profile.spectrumFalloff = 1;
      settings.profile.freeRim = 0;
      settings.profile.tipNoise = 0;
    });
    expect(explicit.finalSvg).toBe(base.finalSvg);
  });

  it("reproduces the stock gross/fine pair from the general spectrum", () => {
    // Two harmonics at falloff 1 must land exactly on lambda1/u1 + lambda2/u2,
    // so widening the spectrum is a strict generalization of the paper's pair.
    expect(study(() => {}).finalSvg).toBe(
      study((settings) => {
        settings.profile.spectrumHarmonics = 2;
        settings.profile.spectrumFalloff = 1;
      }).finalSvg,
    );
  });

  it("changes the cut once anisotropy, variation or extra harmonics engage", () => {
    const base = study(() => {}).finalSvg;
    for (const patch of [
      (s: any) => { s.profile.anisotropy = { delta: 0.4, symmetry: 6 }; },
      (s: any) => { s.profile.pieceVariation = 0.6; },
      (s: any) => { s.profile.spectrumHarmonics = 5; },
      (s: any) => { s.profile.tipNoise = 0.2; },
    ]) {
      expect(study(patch).finalSvg).not.toBe(base);
    }
  });

  it("stays deterministic for every control", () => {
    const patch = (s: any) => {
      s.profile.anisotropy = { delta: 0.35, symmetry: 4 };
      s.profile.pieceVariation = 0.5;
      s.profile.spectrumHarmonics = 4;
      s.profile.tipNoise = 0.15;
    };
    expect(study(patch).finalSvg).toBe(study(patch).finalSvg);
  });

  it("leaves free melt around the board when a rim is requested", () => {
    // The rim is the whole point: pieces must be able to grow outward, so the
    // solver has to report unclaimed board rather than filling it back in.
    const withRim = study((settings) => {
      settings.profile.freeRim = 0.3;
    });
    const withoutRim = study(() => {});
    expect(withRim.liquidRatio).toBeGreaterThan(0.1);
    expect(withoutRim.liquidRatio).toBe(0);
  });
});
