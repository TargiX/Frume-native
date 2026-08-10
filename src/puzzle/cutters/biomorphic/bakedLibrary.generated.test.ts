import { describe, expect, it } from "vitest";

import { decodeBakedCut } from "./bakedCut";
import { describeLibrary } from "./bakedCutLibrary";
import { BAKED_CUT_LIBRARY } from "./bakedLibrary.generated";
import { CUT_STYLES } from "./cutStyles";
import { isBiomorphicTopologySafe } from "./generateBiomorphic";

describe("the shipped cut library", () => {
  it("carries every style the product offers", () => {
    const styles = new Set(describeLibrary(BAKED_CUT_LIBRARY).map((row) => row.style));
    for (const style of CUT_STYLES) {
      expect(styles.has(style.id), style.id).toBe(true);
    }
  });

  it("decodes every entry into a safe board of the size it is filed under", () => {
    // A library that ships a cut the vectorizer or the tray checks reject would
    // fail on a user's first puzzle, where there is no fallback worth having.
    for (const [style, grids] of Object.entries(BAKED_CUT_LIBRARY)) {
      for (const [grid, entries] of Object.entries(grids ?? {})) {
        const [rows, columns] = grid.split("x").map(Number);
        (entries ?? []).forEach((baked, index) => {
          const where = `${style}/${grid}/${index}`;
          const topology = decodeBakedCut(baked);
          expect(topology.rows, where).toBe(rows);
          expect(topology.columns, where).toBe(columns);
          expect(topology.cells, where).toHaveLength(rows * columns);
          expect(isBiomorphicTopologySafe(topology), where).toBe(true);
        });
      }
    }
    // The whole 3.8 MB shipped library decodes in about 2 s on an idle
    // laptop, but the parallel full-suite run and simulator load pushed it
    // past the 5 s vitest default. Give it the room it actually needs.
  }, 30_000);
});
