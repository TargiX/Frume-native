import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { encodeBakedCut, type BakedCut } from "./bakedCut";
import { assertBakedCutAccepted } from "./prepareBakedCut";
import { CUT_STYLES, type CutStyle } from "./cutStyles";
import { resolveCutBakePlan } from "./cutBakePlan";
import { createBiomorphicPhaseFieldTopology } from "./generateBiomorphicPhaseField";
import { BIOMORPHIC_PHASE_FIELD_NUMERICS } from "./phaseFieldLabConfig";

/**
 * The bake job for the shipped cut library.
 *
 * It lives as a skipped test rather than a standalone script because the repo
 * has no TypeScript runner and one is not worth a dependency for this. Run it
 * with FRUME_BAKE=1 and it writes a staged batch; leave the variable unset and
 * `npm test` steps over it.
 *
 *   FRUME_BAKE=1 npx vitest run src/puzzle/cutters/biomorphic/bakeCutLibrary
 *
 * Existing files are kept, so an interrupted bake resumes where it stopped.
 */

/**
 * The default plan reproduces the existing pool. Larger grids and additional
 * seeds are explicit staging batches; the full-resolution complex profiles
 * are retained. Offline cost determines scheduling, not the supported style.
 */
const OUTPUT = process.env.FRUME_BAKE_OUT ?? ".context/cut-bake";

function bakeOne(
  style: CutStyle,
  rows: number,
  columns: number,
  seedIndex: number,
): { baked: BakedCut; seed: string } {
  const seed = `${style.id}-${rows}x${columns}-${seedIndex}`;
  const topology = createBiomorphicPhaseFieldTopology(
    rows,
    columns,
    seed,
    "dendrite",
    style.profile,
    {
      ...BIOMORPHIC_PHASE_FIELD_NUMERICS,
      samplesPerPiece: style.samplesPerPiece,
    },
  );
  // Preserve the selected style's fine fringe. The caller validates the
  // partition and records thickness/angle findings before any asset is saved.
  return { baked: encodeBakedCut(topology), seed };
}

describe.skipIf(!process.env.FRUME_BAKE)("bake the cut library", () => {
  it("writes every style, grid and seed", () => {
    if (resolve(OUTPUT) === resolve('assets/cuts')) {
      throw new Error('Catalog 1 is immutable; bake into a staging directory');
    }
    const plan = resolveCutBakePlan({
      grids: process.env.FRUME_BAKE_GRIDS,
      styles: process.env.FRUME_BAKE_STYLES,
      seedOffset: process.env.FRUME_BAKE_SEED_OFFSET,
      staging: resolve(OUTPUT) !== resolve('assets/cuts'),
    });
    const index: Record<string, string[]> = {};
    const reviews: Record<string, unknown>[] = [];
    let written = 0;
    let skipped = 0;
    const startedAt = Date.now();

    for (const style of plan.styles) {
      for (const [rows, columns, seeds] of plan.grids) {
        const directory = `${OUTPUT}/${style.id}/${rows}x${columns}`;
        mkdirSync(directory, { recursive: true });
        const key = `${style.id}/${rows}x${columns}`;
        index[key] = [];
        for (let seedIndex = plan.seedOffset; seedIndex < plan.seedOffset + seeds; seedIndex += 1) {
          const file = `${directory}/${seedIndex}.json`;
          index[key].push(`${seedIndex}.json`);
          const existing = existsSync(file);
          const baked = existing ? JSON.parse(readFileSync(file, 'utf8')) as BakedCut : bakeOne(style, rows, columns, seedIndex).baked;
          const audits = assertBakedCutAccepted(baked, { policy: 'partition' });
          reviews.push({ file, style: style.id, grid: `${rows}x${columns}`, variant: seedIndex,
            source: existing ? 'existing-asset' : 'generated',
            ...(existing ? {} : { seed: `${style.id}-${rows}x${columns}-${seedIndex}`, profile: style.profile,
              numerics: { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: style.samplesPerPiece } }),
            partitionValid: true, requiresShapeReview: audits.some(audit => !audit.clean),
            rotations: audits.map((audit, index) => ({ turn: rows === columns ? index : index * 2,
              thinRegions: audit.pinches, acuteCorners: audit.sharpCorners, areaOutliers: audit.oddAreas })),
          });
          if (existing) {
            skipped += 1;
            continue;
          }
          writeFileSync(file, JSON.stringify(baked));
          written += 1;
          // eslint-disable-next-line no-console
          console.log(
            `${file} — ${(JSON.stringify(baked).length / 1024).toFixed(1)} KB, ` +
              `${((Date.now() - startedAt) / 1000).toFixed(0)} s elapsed`,
          );
        }
      }
    }

    writeFileSync(
      `${OUTPUT}/index.json`,
      JSON.stringify(
        {
          seedsPerGrid: Object.fromEntries(
            plan.grids.map(([rows, columns, seeds]) => [
              `${rows}x${columns}`,
              seeds,
            ]),
          ),
          seedOffset: plan.seedOffset,
          cuts: index,
        },
        null,
        2,
      ),
    );
    writeFileSync(`${OUTPUT}/quality-review.json`, JSON.stringify({ policy: 'partition',
      note: 'Thin regions and acute corners require style-aware visual review; partition acceptance is not device QA.',
      reviews }, null, 2));
    // Catalogs are immutable. Publication assembles a new version from this
    // staged index and reviewed payloads; the baker never rewrites one.
    // eslint-disable-next-line no-console
    console.log(`baked ${written}, kept ${skipped}`);
    expect(written + skipped).toBe(
      plan.styles.length *
        plan.grids.reduce((total, [, , seeds]) => total + seeds, 0),
    );
  }, 24 * 60 * 60 * 1000);
});

describe("cut styles", () => {
  it("bakes and decodes every shipping style", async () => {
    // The smallest grid only: this guards the wiring -- that each style's
    // profile survives the solver and the codec -- not the library itself.
    const { decodeBakedCut } = await import("./bakedCut");
    const { isBiomorphicTopologySafe } = await import("./generateBiomorphic");
    for (const style of CUT_STYLES) {
      const topology = createBiomorphicPhaseFieldTopology(
        3,
        3,
        `smoke-${style.id}`,
        "dendrite",
        style.profile,
        { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: 42 },
      );
      const rebuilt = decodeBakedCut(encodeBakedCut(topology));
      expect(rebuilt.cells, style.id).toHaveLength(9);
      expect(isBiomorphicTopologySafe(rebuilt), style.id).toBe(true);
    }
  }, 600_000);

  it("gives every style a distinct id and name", () => {
    const ids = CUT_STYLES.map((style) => style.id);
    const names = CUT_STYLES.map((style) => style.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });
});
