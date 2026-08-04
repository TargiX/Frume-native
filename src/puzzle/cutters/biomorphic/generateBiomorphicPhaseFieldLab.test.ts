import { describe, expect, it } from "vitest";

import { runBiomorphicPhaseFieldLab } from "./generateBiomorphicPhaseField";
import { createPhaseFieldLabSettings } from "./phaseFieldLabConfig";

describe("runBiomorphicPhaseFieldLab", () => {
  it("captures deterministic frames from the actual phase-field solver", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.rows = 2;
    settings.columns = 2;
    settings.profile.iterations = 2;
    settings.captureEvery = 1;
    settings.numerics.samplesPerPiece = 12;
    settings.numerics.boundingBoxMargin = 2;
    settings.numerics.thermalBoxMargin = 3;

    const first = runBiomorphicPhaseFieldLab(settings);
    const second = runBiomorphicPhaseFieldLab(settings);

    expect(first.frames.map(({ iteration }) => iteration)).toEqual([0, 1, 2]);
    expect(first.frames.map(({ svg }) => svg)).toEqual(
      second.frames.map(({ svg }) => svg),
    );
    expect(first.finalSvg).toContain("<svg");
    expect(first.finalSvg).toContain('stroke="#e6ad4b"');
  });

  it("grows new Living branches beyond initial edge cleanup", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.profile.iterations = 350;
    const result = runBiomorphicPhaseFieldLab(settings);
    const frame125 = result.frames.find(({ iteration }) => iteration === 125)!;
    const frame350 = result.frames.find(({ iteration }) => iteration === 350)!;

    expect(frame350.maximumPenetrationFromInitial).toBeGreaterThanOrEqual(12);
    expect(frame350.maximumPenetrationFromInitial).toBeGreaterThan(
      frame125.maximumPenetrationFromInitial,
    );
  }, 15_000);

  it("retains developed Living petals while their tips keep advancing", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.rows = 8;
    settings.columns = 8;
    settings.profile.iterations = 100;
    const result = runBiomorphicPhaseFieldLab(settings);
    const developed = result.frames.find(({ iteration }) => iteration === 50)!;
    const evolved = result.frames.find(({ iteration }) => iteration === 100)!;

    // Frame 3 already contains the useful narrow lobes. Subsequent evolution
    // must feed those tips instead of treating them as curvature noise and
    // collapsing the outline into a few large, bland bends.
    expect(evolved.boundaryUnits / developed.boundaryUnits).toBeGreaterThanOrEqual(
      0.9,
    );
    expect(evolved.maximumPenetrationFromInitial).toBeGreaterThan(
      developed.maximumPenetrationFromInitial,
    );
  }, 15_000);

  it("grows existing Amoeba buds instead of replacing them with smooth lobes", () => {
    const settings = createPhaseFieldLabSettings("amoeba");
    settings.rows = 8;
    settings.columns = 8;
    settings.profile.iterations = 100;
    const result = runBiomorphicPhaseFieldLab(settings);
    const developed = result.frames.find(({ iteration }) => iteration === 0)!;
    const evolved = result.frames.find(({ iteration }) => iteration === 100)!;

    expect(evolved.boundaryUnits / developed.boundaryUnits).toBeGreaterThanOrEqual(
      0.9,
    );
    expect(evolved.maximumPenetrationFromInitial).toBeGreaterThan(
      developed.maximumPenetrationFromInitial,
    );
  }, 15_000);

  it("keeps dense Living boards connected and hole-free through frame 8", () => {
    for (const [rows, columns] of [
      [6, 8],
      [8, 8],
    ] as const) {
      const settings = createPhaseFieldLabSettings("dendrite");
      settings.rows = rows;
      settings.columns = columns;
      settings.profile.iterations = 175;
      const result = runBiomorphicPhaseFieldLab(settings);
      expect(result.frames[7].iteration).toBe(175);
      expect(
        result.frames[7].maximumPenetrationFromInitial,
        `${columns}x${rows} growth at frame 8`,
      ).toBeGreaterThanOrEqual(4);
      result.frames.forEach((frame) => {
        expect(
          Math.max(...frame.componentCounts),
          `${columns}x${rows} iteration ${frame.iteration}`,
        ).toBe(1);
        expect(
          Math.max(...frame.holeCounts),
          `${columns}x${rows} holes at ${frame.iteration}`,
        ).toBe(0);
      });
    }
  }, 60_000);

  it("preserves topology at every solver step, not only captured frames", () => {
    const settings = createPhaseFieldLabSettings("dendrite");
    settings.rows = 3;
    settings.columns = 3;
    settings.profile.iterations = 250;
    settings.captureEvery = 1;
    settings.numerics.samplesPerPiece = 24;
    const result = runBiomorphicPhaseFieldLab(settings);
    expect(result.frames).toHaveLength(251);
    result.frames.forEach((frame) => {
      expect(
        Math.max(...frame.componentCounts),
        `iteration ${frame.iteration}`,
      ).toBe(1);
      expect(Math.max(...frame.holeCounts), `holes at ${frame.iteration}`).toBe(
        0,
      );
    });
  }, 15_000);
});
