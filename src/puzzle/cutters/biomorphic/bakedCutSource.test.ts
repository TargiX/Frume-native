import { afterEach, describe, expect, it } from "vitest";

import { encodeBakedCut } from "./bakedCut";
import { gridKey, type BakedCutLibrary } from "./bakedCutLibrary";
import {
  biomorphicPiecesFrom,
  clearBakedCutLibrary,
  hasBakedCut,
  installBakedCutLibrary,
} from "./bakedCutSource";
import { getCutStyle } from "./cutStyles";
import { createBiomorphicPhaseFieldTopology } from "./generateBiomorphicPhaseField";
import { BIOMORPHIC_PHASE_FIELD_NUMERICS } from "./phaseFieldLabConfig";

const baked = encodeBakedCut(
  createBiomorphicPhaseFieldTopology(
    3,
    3,
    "installed",
    "dendrite",
    getCutStyle("amoeba-coral").profile,
    { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: 42 },
  ),
);

const library: BakedCutLibrary = {
  "living-fringe": { [gridKey(3, 3)]: [baked] },
};

afterEach(() => clearBakedCutLibrary());

describe("where a cutter gets its cut", () => {
  it("fails closed when no library is installed", () => {
    let solved = false;
    expect(() =>
      biomorphicPiecesFrom(
        "living-fringe",
        3,
        3,
        600,
        600,
        "seed",
        () => {
          solved = true;
          return [];
        },
      ),
    ).toThrow(
      'Required baked living-fringe cut for a 3x3 board is unavailable',
    );
    expect(solved).toBe(false);
  });

  it("uses the library instead of solving once one is installed", () => {
    installBakedCutLibrary(library);
    let solved = false;
    const pieces = biomorphicPiecesFrom(
      "living-fringe",
      3,
      3,
      600,
      600,
      "seed",
      () => {
        solved = true;
        return [];
      },
    );
    // The point of the library is that this path never reaches the solver: on
    // a phone that call is minutes, not milliseconds.
    expect(solved).toBe(false);
    expect(pieces).toHaveLength(9);
  });

  it("fails closed for a grid the library does not carry", () => {
    installBakedCutLibrary(library);
    let solved = false;
    expect(() =>
      biomorphicPiecesFrom("living-fringe", 5, 5, 600, 600, "seed", () => {
        solved = true;
        return [];
      }),
    ).toThrow('Required baked living-fringe cut for a 5x5 board is unavailable');
    expect(solved).toBe(false);
  });

  it("fails closed for a style the library does not carry", () => {
    installBakedCutLibrary(library);
    let solved = false;
    expect(() =>
      biomorphicPiecesFrom("crystal-six", 3, 3, 600, 600, "seed", () => {
        solved = true;
        return [];
      }),
    ).toThrow('Required baked crystal-six cut for a 3x3 board is unavailable');
    expect(solved).toBe(false);
  });

  it("reports what it can serve without building anything", () => {
    expect(hasBakedCut("living-fringe", 3, 3)).toBe(false);
    installBakedCutLibrary(library);
    expect(hasBakedCut("living-fringe", 3, 3)).toBe(true);
    expect(hasBakedCut("living-fringe", 4, 4)).toBe(false);
    expect(hasBakedCut("amoeba-coral", 3, 3)).toBe(false);
  });

  it("lays the same pieces out for the same seed", () => {
    installBakedCutLibrary(library);
    const solve = () => [];
    const first = biomorphicPiecesFrom(
      "living-fringe",
      3,
      3,
      600,
      600,
      "repeat",
      solve,
    );
    const second = biomorphicPiecesFrom(
      "living-fringe",
      3,
      3,
      600,
      600,
      "repeat",
      solve,
    );
    expect(second).toEqual(first);
  });
});
