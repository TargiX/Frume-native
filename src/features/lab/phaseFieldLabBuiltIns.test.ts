import { describe, expect, it } from "vitest";

import { parsePhaseFieldLabSettings } from "../../puzzle/cutters/biomorphic/phaseFieldLabConfig";
import { PHASE_FIELD_LAB_BUILT_INS } from "./phaseFieldLabBuiltIns";

describe("PHASE_FIELD_LAB_BUILT_INS", () => {
  it("ships only settings the lab's own validator accepts", () => {
    // A built-in that fails to parse would blow up on load, since the screen
    // re-serializes settings the moment a preset is selected.
    for (const builtIn of PHASE_FIELD_LAB_BUILT_INS) {
      expect(
        () => parsePhaseFieldLabSettings(builtIn.settings),
        builtIn.id,
      ).not.toThrow();
    }
  });

  it("gives every built-in a distinct id and name", () => {
    const ids = PHASE_FIELD_LAB_BUILT_INS.map((builtIn) => builtIn.id);
    const names = PHASE_FIELD_LAB_BUILT_INS.map((builtIn) => builtIn.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the tuned fringe presets on the resolution they were measured at", () => {
    // The unstable band is an absolute pixel count, so these two only reproduce
    // the cut they were chosen for at the resolution they were measured on.
    for (const id of ["living-fringe-fine", "living-fringe-wild"]) {
      const builtIn = PHASE_FIELD_LAB_BUILT_INS.find(
        (candidate) => candidate.id === id,
      )!;
      expect(builtIn.settings.numerics.samplesPerPiece).toBe(96);
      expect(builtIn.settings.profile.lambda1).toBe(16);
      expect(builtIn.settings.profile.lambda2).toBe(8);
    }
  });
});
