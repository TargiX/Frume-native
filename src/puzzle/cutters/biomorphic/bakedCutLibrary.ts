import {
  decodeBakedCut,
  type BakedCut,
  type BakedCutQuarterTurns,
} from "./bakedCut";
import type { CutStyleId } from "./cutStyles";
import type { BiomorphicTopology } from "./generateBiomorphic";

/**
 * Choosing one pre-generated cut out of the shipped library.
 *
 * The library replaces per-image generation, which measured in minutes on a
 * phone. That trades an unbounded supply of cuts for a finite one, so the two
 * jobs here are picking a cut that feels arbitrary rather than fixed, and
 * making the same picture come back to the same cut.
 *
 * Nothing in this file reads the filesystem: the caller passes the entries it
 * has. That keeps it testable, and keeps how the assets are packaged -- one
 * module per style, a lazy require, an eventual download -- a separate
 * decision from how one is chosen.
 */

export type BakedCutLibrary = Partial<
  Record<CutStyleId, Partial<Record<string, readonly BakedCut[]>>>
>;

export function gridKey(rows: number, columns: number): string {
  return `${rows}x${columns}`;
}

/**
 * FNV-1a over the seed. Any stable hash would do; what matters is that the
 * same seed always lands on the same cut, so reopening a saved puzzle finds
 * the shapes it was left with.
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The cut a seed lands on, and how it is turned.
 *
 * Turning multiplies what a finite library can serve by four at no cost in
 * bytes, so a player has to reach the thirty-third puzzle of one style and
 * size before a board repeats rather than the ninth.
 */
export function pickBakedCut(
  library: BakedCutLibrary,
  style: CutStyleId,
  rows: number,
  columns: number,
  seed: string,
): { cut: BakedCut; turns: BakedCutQuarterTurns } {
  const entries = library[style]?.[gridKey(rows, columns)];
  if (!entries || entries.length === 0) {
    throw new Error(
      `No baked ${style} cut for a ${gridKey(rows, columns)} board`,
    );
  }
  // A quarter turn of an oblong board would not fit the grid asked for.
  const turnCount = rows === columns ? 4 : 2;
  const variant = hashSeed(seed) % (entries.length * turnCount);
  return {
    cut: entries[variant % entries.length],
    turns: (Math.floor(variant / entries.length) *
      (turnCount === 2 ? 2 : 1)) as BakedCutQuarterTurns,
  };
}

export function topologyFromLibrary(
  library: BakedCutLibrary,
  style: CutStyleId,
  rows: number,
  columns: number,
  seed: string,
): BiomorphicTopology {
  const { cut: baked, turns } = pickBakedCut(library, style, rows, columns, seed);
  if (baked.rows !== rows || baked.columns !== columns) {
    // A mislabelled entry would silently hand back a board of the wrong shape,
    // which surfaces much later as pieces that do not tile.
    throw new Error(
      `Baked ${style} cut filed under ${gridKey(rows, columns)} is ` +
        `${gridKey(baked.rows, baked.columns)}`,
    );
  }
  return decodeBakedCut(baked, turns);
}

/** Which styles and grids the library can actually serve. */
export function describeLibrary(
  library: BakedCutLibrary,
): { style: CutStyleId; grid: string; count: number }[] {
  const rows: { style: CutStyleId; grid: string; count: number }[] = [];
  for (const [style, grids] of Object.entries(library)) {
    for (const [grid, entries] of Object.entries(grids ?? {})) {
      rows.push({
        style: style as CutStyleId,
        grid,
        count: entries?.length ?? 0,
      });
    }
  }
  return rows.sort(
    (first, second) =>
      first.style.localeCompare(second.style) ||
      first.grid.localeCompare(second.grid),
  );
}
