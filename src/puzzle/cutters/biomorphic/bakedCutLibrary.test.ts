import { describe, expect, it } from "vitest";

import { encodeBakedCut } from "./bakedCut";
import {
  describeLibrary,
  gridKey,
  hashSeed,
  pickBakedCut,
  topologyFromLibrary,
  type BakedCutLibrary,
} from "./bakedCutLibrary";
import { createBiomorphicPhaseFieldTopology } from "./generateBiomorphicPhaseField";
import { BIOMORPHIC_PHASE_FIELD_NUMERICS } from "./phaseFieldLabConfig";
import { getCutStyle } from "./cutStyles";

function bake(rows: number, columns: number, seed: string) {
  return encodeBakedCut(
    createBiomorphicPhaseFieldTopology(
      rows,
      columns,
      seed,
      "dendrite",
      getCutStyle("amoeba-coral").profile,
      { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: 42 },
    ),
  );
}

describe("baked cut library", () => {
  const library: BakedCutLibrary = {
    "amoeba-coral": {
      [gridKey(3, 3)]: [bake(3, 3, "a"), bake(3, 3, "b"), bake(3, 3, "c")],
    },
  };

  it("sends the same seed to the same cut every time", () => {
    // A saved puzzle reopens by seed, so a picture that drifts to another cut
    // between sessions would come back with pieces that no longer fit it.
    for (const seed of ["photo-1", "photo-2", "photo-3", "photo-4"]) {
      const first = pickBakedCut(library, "amoeba-coral", 3, 3, seed);
      const second = pickBakedCut(library, "amoeba-coral", 3, 3, seed);
      expect(second).toBe(first);
    }
  });

  it("spreads different seeds across the shelf", () => {
    const seen = new Set<unknown>();
    for (let index = 0; index < 60; index += 1) {
      seen.add(pickBakedCut(library, "amoeba-coral", 3, 3, `photo-${index}`));
    }
    expect(seen.size).toBe(3);
  });

  it("decodes into a board of the size that was asked for", () => {
    const topology = topologyFromLibrary(library, "amoeba-coral", 3, 3, "seed");
    expect(topology.rows).toBe(3);
    expect(topology.columns).toBe(3);
    expect(topology.cells).toHaveLength(9);
  });

  it("refuses a grid it has nothing for, by name", () => {
    expect(() => pickBakedCut(library, "amoeba-coral", 5, 5, "seed")).toThrow(
      /No baked amoeba-coral cut for a 5x5 board/,
    );
    expect(() => pickBakedCut(library, "crystal-six", 3, 3, "seed")).toThrow(
      /No baked crystal-six cut/,
    );
  });

  it("catches an entry filed under the wrong grid", () => {
    // Silently returning the wrong board shape would surface much later, as
    // pieces that do not tile.
    const mislabelled: BakedCutLibrary = {
      "amoeba-coral": { [gridKey(5, 5)]: [bake(3, 3, "a")] },
    };
    expect(() =>
      topologyFromLibrary(mislabelled, "amoeba-coral", 5, 5, "seed"),
    ).toThrow(/filed under 5x5 is 3x3/);
  });

  it("hashes seeds without collapsing them", () => {
    const seeds = Array.from({ length: 500 }, (_, index) => `seed-${index}`);
    expect(new Set(seeds.map(hashSeed)).size).toBe(seeds.length);
  });

  it("reports what it holds", () => {
    expect(describeLibrary(library)).toEqual([
      { style: "amoeba-coral", grid: "3x3", count: 3 },
    ]);
  });
});
