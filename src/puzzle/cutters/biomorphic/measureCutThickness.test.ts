import { describe, expect, it } from "vitest";

import { measureCutThickness } from "./measureCutThickness";

const WIDTH = 64;
const HEIGHT = 64;

/**
 * Every case here is a shape whose answer is known by construction, because the
 * previous attempt at this measurement was written straight against real cuts
 * and spent three rounds confidently reporting the wrong thing.
 */
function board(paint: (set: (x: number, y: number) => void) => void): Int16Array {
  const labels = new Int16Array(WIDTH * HEIGHT).fill(1);
  paint((x, y) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    labels[y * WIDTH + x] = 0;
  });
  return labels;
}

function rect(
  set: (x: number, y: number) => void,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) set(x, y);
  }
}

describe("measureCutThickness", () => {
  it("finds nothing thin in a solid block", () => {
    const labels = board((set) => rect(set, 20, 20, 24, 24));
    const result = measureCutThickness(labels, WIDTH, HEIGHT, 2, 6);
    expect(result.kind).toBe("none");
    expect(result.narrowestSamples).toBe(12);
  });

  it("measures the isthmus between two blocks", () => {
    // Two 16-wide blocks joined by a bridge four samples tall.
    const labels = board((set) => {
      rect(set, 6, 20, 16, 24);
      rect(set, 42, 20, 16, 24);
      rect(set, 22, 30, 20, 4);
    });
    const result = measureCutThickness(labels, WIDTH, HEIGHT, 2, 8);
    expect(result.kind).toBe("isthmus");
    expect(result.narrowestSamples).toBeLessThanOrEqual(6);
    expect(result.narrowestSamples).toBeGreaterThanOrEqual(4);
  });

  it("measures a hair hanging off a block", () => {
    // A block with a two-sample-wide, sixteen-long whisker. Nothing splits --
    // the whisker simply falls off -- so only the opening pass can catch it.
    const labels = board((set) => {
      rect(set, 12, 20, 24, 24);
      rect(set, 36, 30, 16, 2);
    });
    const result = measureCutThickness(labels, WIDTH, HEIGHT, 2, 8);
    expect(result.kind).toBe("appendage");
    expect(result.narrowestSamples).toBeLessThanOrEqual(4);
  });

  it("does not call a diagonal edge thin", () => {
    // The staircase of a 45-degree edge loses samples to every erosion. Reading
    // that as an appendage is exactly the false positive that makes a
    // manufacturability check useless.
    const labels = board((set) => {
      for (let y = 8; y < 56; y += 1) {
        for (let x = 8; x < 8 + (y - 8); x += 1) set(x, y);
      }
    });
    const result = measureCutThickness(labels, WIDTH, HEIGHT, 2, 5);
    expect(result.kind).toBe("none");
  });

  it("reports the thinnest piece when several are present", () => {
    // Piece 0 carries a six-wide bridge, piece 2 a two-wide one. The thinner
    // must win, and it must be named.
    const labels = new Int16Array(WIDTH * HEIGHT).fill(1);
    const set = (owner: number) => (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
      labels[y * WIDTH + x] = owner;
    };
    rect(set(0), 2, 4, 12, 12);
    rect(set(0), 26, 4, 12, 12);
    rect(set(0), 14, 7, 12, 6);
    rect(set(2), 2, 40, 12, 12);
    rect(set(2), 26, 40, 12, 12);
    rect(set(2), 14, 45, 12, 2);
    const result = measureCutThickness(labels, WIDTH, HEIGHT, 3, 8);
    expect(result.piece).toBe(2);
    expect(result.narrowestSamples).toBeLessThanOrEqual(4);
  });
});

describe("measureCutThickness on real cuts", () => {
  it("separates the fat Amoeba cut from the thin Living one", async () => {
    // Not a threshold on either -- what the plywood can take is a shop
    // question, not a code one -- but the gap between the families is large
    // and stable, so it catches a regression that thins every cut at once.
    const { runBiomorphicPhaseFieldLab } = await import(
      "./generateBiomorphicPhaseField"
    );
    const { createPhaseFieldLabSettings } = await import(
      "./phaseFieldLabConfig"
    );
    const run = (style: "dendrite" | "amoeba") => {
      const settings = createPhaseFieldLabSettings(style);
      settings.rows = 3;
      settings.columns = 3;
      settings.numerics.samplesPerPiece = 42;
      settings.profile.iterations = 300;
      settings.captureEvery = 300;
      return runBiomorphicPhaseFieldLab(settings).thinnest;
    };
    const living = run("dendrite");
    const amoeba = run("amoeba");
    expect(amoeba.fraction).toBeGreaterThan(living.fraction);
    expect(living.fraction).toBeGreaterThan(0);
  }, 120_000);
});

describe("rounding the partition", () => {
  it("thins out fewer pieces as the neck floor rises", async () => {
    // This pass silently did nothing for five rounds of work: it ran above the
    // line where the solver rebuilds ownership from the phase fields, so every
    // label it changed was thrown away before the caller saw it. Pin the fix by
    // asserting the effect, not the call.
    const { runBiomorphicPhaseFieldLab } = await import(
      "./generateBiomorphicPhaseField"
    );
    const { createPhaseFieldLabSettings } = await import(
      "./phaseFieldLabConfig"
    );
    const thinPieces = (minNeck: number) => {
      const settings = createPhaseFieldLabSettings("dendrite");
      settings.rows = 3;
      settings.columns = 3;
      settings.numerics.samplesPerPiece = 64;
      settings.profile.iterations = 400;
      settings.captureEvery = 400;
      settings.profile.minNeck = minNeck;
      const result = runBiomorphicPhaseFieldLab(settings);
      expect(result.vectorizationError).toBeUndefined();
      return result.thinnest.perPiece.filter((value) => value < 4).length;
    };
    expect(thinPieces(0.08)).toBeLessThan(thinPieces(0));
  }, 180_000);
});
