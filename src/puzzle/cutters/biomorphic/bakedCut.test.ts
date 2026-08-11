import { describe, expect, it } from "vitest";

import { decodeBakedCut, encodeBakedCut } from "./bakedCut";
import {
  createBiomorphicPhaseFieldTopology,
  generateBiomorphicPhaseFieldPieces,
} from "./generateBiomorphicPhaseField";
import {
  generateBiomorphicPiecesFromTopology,
  isBiomorphicTopologySafe,
  sampleBiomorphicEdge,
} from "./generateBiomorphic";

const topology = createBiomorphicPhaseFieldTopology(3, 3, "baked", "dendrite");

describe("baked cuts", () => {
  it("rebuilds the same geometry it was given", () => {
    // Coordinates are quantized to one part in 65535 of the board, so the
    // rebuilt curve is allowed to move by that much and no more.
    const rebuilt = decodeBakedCut(encodeBakedCut(topology));
    expect(rebuilt.edges).toHaveLength(topology.edges.length);
    expect(rebuilt.cells).toHaveLength(topology.cells.length);

    let worst = 0;
    topology.edges.forEach((edge, index) => {
      const before = sampleBiomorphicEdge(edge, 1, 4);
      const after = sampleBiomorphicEdge(rebuilt.edges[index], 1, 4);
      expect(after).toHaveLength(before.length);
      before.forEach((point, sample) => {
        worst = Math.max(
          worst,
          Math.hypot(point.x - after[sample].x, point.y - after[sample].y),
        );
      });
    });
    expect(worst).toBeLessThan(0.0001);
  });

  it("keeps the cut manufacturable through a round trip", () => {
    expect(isBiomorphicTopologySafe(decodeBakedCut(encodeBakedCut(topology))))
      .toBe(isBiomorphicTopologySafe(topology));
  });

  it("produces the same pieces as generating from scratch", () => {
    const direct = generateBiomorphicPhaseFieldPieces(3, 3, 900, 900, "baked");
    const viaBake = generateBiomorphicPiecesFromTopology(
      decodeBakedCut(encodeBakedCut(topology)),
      900,
      900,
    );
    expect(viaBake).toHaveLength(direct.length);
    expect(viaBake.map((piece) => piece.id)).toEqual(
      direct.map((piece) => piece.id),
    );
  }, 120_000);

  it("refuses a payload from a different layout version", () => {
    const baked = { ...encodeBakedCut(topology), version: 99 };
    expect(() => decodeBakedCut(baked)).toThrow(/version 99/);
  });
});
