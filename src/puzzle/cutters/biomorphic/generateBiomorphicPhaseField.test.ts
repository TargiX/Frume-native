import { describe, expect, it } from "vitest";

import {
  hasBiomorphicSelfIntersections,
  sampleBiomorphicEdge,
  sampleBiomorphicPieceOutline,
  signedBiomorphicArea,
} from "./generateBiomorphic";
import {
  createBiomorphicPhaseFieldTopology,
  generateBiomorphicPhaseFieldPieces,
  measureBiomorphicPhaseFieldGrowth,
  runBiomorphicPhaseFieldLab,
} from "./generateBiomorphicPhaseField";
import { createPhaseFieldLabSettings } from "./phaseFieldLabConfig";

function recipe(rows: number, columns: number, seed: string) {
  const topology = createBiomorphicPhaseFieldTopology(rows, columns, seed);
  return {
    cells: topology.cells.map((cell) => ({
      id: cell.id,
      site: cell.site,
      neighbors: cell.neighborIds,
      traversals: cell.edgeTraversals.map(({ edge, direction }) => ({
        id: edge.id,
        direction,
      })),
    })),
    edges: topology.edges.map((edge) => ({
      id: edge.id,
      exterior: edge.exterior,
      owners: edge.ownerIds,
      segments: edge.segments,
    })),
  };
}

describe("createBiomorphicPhaseFieldTopology", () => {
  it("relaxes into a connected organic cut instead of disconnected detail", () => {
    const growth = measureBiomorphicPhaseFieldGrowth(
      5,
      5,
      "phase-must-actually-grow",
    );
    // The previous high amplification values counted detached islands as
    // desirable interface. A physical piece must stay one connected surface;
    // the stable solve still departs substantially from Voronoi while surface
    // tension relaxes the deliberately aggressive initial perturbation.
    expect(growth.changedLabelRatio).toBeGreaterThan(0.03);
    // Raw perimeter alone rewards high-frequency input noise. Keep a strong
    // lower bound against a bland Voronoi cut, while the lab regression test
    // separately proves that developed lobes survive and keep advancing.
    expect(growth.boundaryAmplification).toBeGreaterThan(1.4);
    expect(growth.simulationChangedLabelRatio).toBeGreaterThan(0.008);
    expect(growth.simulationBoundaryAmplification).toBeGreaterThan(0.6);
    expect(growth.simulationBoundaryAmplification).toBeLessThan(1);
    expect(growth.simulationMaximumPenetrationSamples).toBeGreaterThanOrEqual(
      2,
    );
    expect(growth.maximumPenetrationSamples).toBeGreaterThanOrEqual(15);
    expect(growth.deepGrowthRatio).toBeGreaterThan(0.45);
    expect(growth.cleanupChangedLabelRatio).toBeLessThan(0.005);
    expect(growth.liquidRatio).toBeLessThan(0.15);
    expect(growth.safeAfterSimulation).toBe(true);
  }, 180_000);

  it("is deterministic while different seeds evolve different cuts", () => {
    expect(recipe(4, 4, "phase-repeat")).toEqual(recipe(4, 4, "phase-repeat"));
    expect(recipe(4, 4, "phase-other")).not.toEqual(
      recipe(4, 4, "phase-repeat"),
    );
  }, 90_000);

  it("grows the amoeba regime into its own interlocked, safe cut", () => {
    const growth = measureBiomorphicPhaseFieldGrowth(
      5,
      5,
      "amoeba-must-grow",
      "amoeba",
    );
    // Replacing more initial labels used to reward the exact failure where
    // fine Amoeba buds vanished before unrelated broad lobes appeared. Keep
    // substantial evolution here; the lab regression separately requires
    // the original buds to survive while their tips advance.
    expect(growth.changedLabelRatio).toBeGreaterThan(0.06);
    expect(growth.boundaryAmplification).toBeGreaterThan(1.3);
    expect(growth.maximumPenetrationSamples).toBeGreaterThanOrEqual(14);
    expect(growth.deepGrowthRatio).toBeGreaterThan(0.4);
    expect(growth.cleanupChangedLabelRatio).toBeLessThan(0.02);
    expect(growth.liquidRatio).toBeLessThan(0.15);
    expect(growth.safeAfterSimulation).toBe(true);

    const compareStyle = (style: "dendrite" | "amoeba") => {
      const settings = createPhaseFieldLabSettings(style);
      settings.seed = "style-split";
      settings.rows = 3;
      settings.columns = 3;
      settings.profile.iterations = 100;
      settings.numerics.samplesPerPiece = 24;
      return runBiomorphicPhaseFieldLab(settings).finalSvg;
    };
    expect(compareStyle("amoeba")).not.toEqual(compareStyle("dendrite"));
  }, 180_000);

  it("extracts each simulated interface once and traverses it in exact reverse", () => {
    const topology = createBiomorphicPhaseFieldTopology(4, 4, "phase-shared");

    topology.edges
      .filter(({ exterior }) => !exterior)
      .forEach((edge) => {
        expect(edge.ownerIds).toHaveLength(2);
        const [firstOwner, secondOwner] = edge.ownerIds;
        const first = topology.cells.find(({ id }) => id === firstOwner)!;
        const second = topology.cells.find(({ id }) => id === secondOwner)!;
        const firstTraversal = first.edgeTraversals.find(
          ({ edge: candidate }) => candidate === edge,
        )!;
        const secondTraversal = second.edgeTraversals.find(
          ({ edge: candidate }) => candidate === edge,
        )!;
        const forward = sampleBiomorphicEdge(edge, firstTraversal.direction, 6);
        const reverse = sampleBiomorphicEdge(
          edge,
          secondTraversal.direction,
          6,
        ).reverse();

        expect(firstTraversal.direction).toBe(-secondTraversal.direction);
        expect(reverse).toHaveLength(forward.length);
        forward.forEach((point, index) => {
          expect(reverse[index].x).toBeCloseTo(point.x, 13);
          expect(reverse[index].y).toBeCloseTo(point.y, 13);
        });
      });
  }, 60_000);

  it("produces irregular multi-scale interfaces instead of a fixed lobe template", () => {
    const topology = createBiomorphicPhaseFieldTopology(
      5,
      5,
      "phase-complexity",
    );
    const internal = topology.edges.filter(({ exterior }) => !exterior);
    const segmentCounts = internal.map(({ segments }) => segments.length);

    expect(internal.length).toBeGreaterThan(40);
    expect(Math.max(...segmentCounts)).toBeGreaterThanOrEqual(18);
    expect(new Set(segmentCounts).size).toBeGreaterThanOrEqual(12);
    expect(
      internal.filter(({ segments }) => segments.length >= 5).length,
    ).toBeGreaterThan(internal.length * 0.5);

    const tortuosities = internal.map((edge) => {
      const points = sampleBiomorphicEdge(edge, 1, 8);
      const pathLength = points.slice(1).reduce((total, point, index) => {
        const previous = points[index];
        return total + Math.hypot(point.x - previous.x, point.y - previous.y);
      }, 0);
      const directLength = Math.hypot(
        points[points.length - 1].x - points[0].x,
        points[points.length - 1].y - points[0].y,
      );
      return pathLength / directLength;
    });
    const sorted = [...tortuosities].sort((first, second) => first - second);

    expect(Math.max(...sorted)).toBeGreaterThan(1.7);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThan(1.15);
  }, 60_000);

  it("keeps a seed matrix connected, substantial, simple, and gap-free", () => {
    for (let index = 0; index < 18; index += 1) {
      const size = 3 + (index % 3);
      const topology = createBiomorphicPhaseFieldTopology(
        size,
        size,
        `phase-safety-${index}`,
      );
      const idealArea = 1 / topology.cells.length;
      let totalArea = 0;

      topology.cells.forEach((cell) => {
        const outline = sampleBiomorphicPieceOutline(topology, cell.index, 8);
        const area = signedBiomorphicArea(outline);

        expect(hasBiomorphicSelfIntersections(outline)).toBe(false);
        expect(area).toBeGreaterThan(idealArea * 0.28);
        expect(
          outline.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1),
        ).toBe(true);
        totalArea += area;
      });

      expect(totalArea).toBeCloseTo(1, 5);
    }
  }, 600_000);
});

describe("generateBiomorphicPhaseFieldPieces", () => {
  it("builds tray-safe pieces from the simulated topology", () => {
    const width = 640;
    const height = 360;
    const pieces = generateBiomorphicPhaseFieldPieces(
      5,
      5,
      width,
      height,
      "phase-piece-output",
    );

    expect(pieces).toHaveLength(25);
    pieces.forEach((piece) => {
      expect(piece.path.startsWith("M ")).toBe(true);
      expect(piece.path.endsWith("Z")).toBe(true);
      expect((piece.bounds.width / width) * 5).toBeLessThan(2.15);
      expect((piece.bounds.height / height) * 5).toBeLessThan(2.15);
    });
  }, 60_000);
});
