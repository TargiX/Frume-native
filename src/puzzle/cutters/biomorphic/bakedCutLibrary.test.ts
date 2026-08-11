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
      expect(second.cut).toBe(first.cut);
      expect(second.turns).toBe(first.turns);
    }
  });

  it("spreads different seeds across the shelf, turns and all", () => {
    const cuts = new Set<unknown>();
    const variants = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const { cut, turns } = pickBakedCut(
        library,
        "amoeba-coral",
        3,
        3,
        `photo-${index}`,
      );
      cuts.add(cut);
      variants.add(`${[...cuts].indexOf(cut)}:${turns}`);
    }
    expect(cuts.size).toBe(3);
    // Three cuts turned four ways: twelve boards out of three baked entries.
    expect(variants.size).toBe(12);
  });

  it("decodes into a board of the size that was asked for", () => {
    const topology = topologyFromLibrary(library, "amoeba-coral", 3, 3, "seed");
    expect(topology.rows).toBe(3);
    expect(topology.columns).toBe(3);
    expect(topology.cells).toHaveLength(9);
  });

  it("turns a cut into a board that is still whole", async () => {
    const { isBiomorphicTopologySafe } = await import("./generateBiomorphic");
    const { decodeBakedCut } = await import("./bakedCut");
    const baked = bake(3, 3, "a");
    const upright = decodeBakedCut(baked, 0);

    for (const turns of [1, 2, 3] as const) {
      const turned = decodeBakedCut(baked, turns);
      expect(isBiomorphicTopologySafe(turned), `${turns}`).toBe(true);
      expect(turned.cells).toHaveLength(upright.cells.length);
      // Same pieces, somewhere else: a turn that changed nothing would be a
      // variant in name only.
      expect(turned.cells[0].site).not.toEqual(upright.cells[0].site);
      // Grid coordinates follow the geometry, or the placement zones drawn on
      // the board would point at the wrong cells. Every square is still
      // occupied exactly once.
      const squares = new Set(
        turned.cells.map((cell) => `${cell.row},${cell.col}`),
      );
      expect(squares.size, `${turns}`).toBe(turned.cells.length);
    }
  }, 30_000);

  it("turns rigidly rather than reshaping", async () => {
    const { decodeBakedCut } = await import("./bakedCut");
    const baked = bake(3, 3, "a");
    const upright = decodeBakedCut(baked, 0);
    const quarter = decodeBakedCut(baked, 1);

    upright.cells.forEach((cell, index) => {
      const moved = quarter.cells[index];
      // One clockwise quarter turn of the unit board, stated here
      // independently of the code that performs it -- and the grid
      // coordinates turned to match, so zones stay over their pieces.
      expect(moved.site.x).toBeCloseTo(1 - cell.site.y, 4);
      expect(moved.site.y).toBeCloseTo(cell.site.x, 4);
      expect(moved.row).toBe(cell.col);
      expect(moved.col).toBe(upright.rows - 1 - cell.row);
    });
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
