import { describe, expect, it } from "vitest";

import {
  createPhaseFieldLabSettings,
  parsePhaseFieldLabSettings,
  serializePhaseFieldLabSettings,
} from "./phaseFieldLabConfig";

describe("phaseFieldLabConfig", () => {
  it("round-trips every simulation control without sharing profile arrays", () => {
    const first = createPhaseFieldLabSettings("amoeba");
    const second = createPhaseFieldLabSettings("amoeba");
    first.profile.warpWavelengths[0] = 321;

    expect(second.profile.warpWavelengths[0]).not.toBe(321);
    expect(
      parsePhaseFieldLabSettings(
        JSON.parse(serializePhaseFieldLabSettings(first)),
      ),
    ).toEqual(first);
    expect(first.numerics.topologyProjectionEvery).toBe(1);
  });

  it("fails loudly for incomplete or unsafe presets", () => {
    expect(() => parsePhaseFieldLabSettings({ style: "dendrite" })).toThrow(
      "name must be a non-empty string",
    );
    const invalid = createPhaseFieldLabSettings();
    invalid.numerics.samplesPerPiece = 4;
    expect(() => parsePhaseFieldLabSettings(invalid)).toThrow(
      "samplesPerPiece must be an integer between 12 and 256",
    );
  });
});

describe("new cut-style controls", () => {
  it("rejects an anisotropy symmetry the solver cannot build", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.profile.anisotropy = { delta: 0.3, symmetry: 5 };
    expect(() => parsePhaseFieldLabSettings(settings)).toThrow(
      /symmetry must be 4 or 6/,
    );
  });

  it("keeps the spectrum harmonic count a whole number", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.profile.spectrumHarmonics = 3.5;
    expect(() => parsePhaseFieldLabSettings(settings)).toThrow(
      /spectrumHarmonics/,
    );
  });

  it("round-trips the new controls through serialization", () => {
    const settings = createPhaseFieldLabSettings("amoeba");
    settings.profile.anisotropy = { delta: 0.4, symmetry: 4 };
    settings.profile.pieceVariation = 0.6;
    settings.profile.spectrumHarmonics = 5;
    settings.profile.spectrumFalloff = 0.8;
    settings.profile.freeRim = 0.2;
    settings.profile.tipNoise = 0.12;
    const parsed = parsePhaseFieldLabSettings(
      JSON.parse(serializePhaseFieldLabSettings(settings)),
    );
    expect(parsed.profile).toEqual(settings.profile);
  });

  it("clones the anisotropy object instead of sharing it between styles", () => {
    const first = createPhaseFieldLabSettings("dendrite");
    const second = createPhaseFieldLabSettings("dendrite");
    first.profile.anisotropy.delta = 0.5;
    expect(second.profile.anisotropy.delta).toBe(0);
  });
});
