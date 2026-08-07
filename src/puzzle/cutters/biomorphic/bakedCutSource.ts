import type { PuzzlePieceDefinition } from "../../types/layout";
import { topologyFromLibrary, type BakedCutLibrary } from "./bakedCutLibrary";
import type { CutStyleId } from "./cutStyles";
import { generateBiomorphicPiecesFromTopology } from "./generateBiomorphic";

/**
 * Where a cutter gets its cut from.
 *
 * Solving one takes tens of seconds on a laptop and minutes on a phone, so the
 * shipped path is a pre-generated library. Until that library is baked and
 * installed the cutters fall back to solving, which is why this takes the
 * fallback as an argument rather than owning it: a missing library is a
 * slow puzzle, not a broken one.
 *
 * Note while the fallback is still live: it solves the cutter's stock profile,
 * not the tuned style the library will carry. So a fallback cut and a library
 * cut of the same style do not match today. That resolves the moment the
 * library ships, and it is deliberate -- pointing the fallback at the tuned
 * profiles now would quadruple the solve time of every test and every cold
 * start for a path meant to be rare.
 */

let installed: BakedCutLibrary = {};

export function installBakedCutLibrary(library: BakedCutLibrary): void {
  installed = library;
}

export function clearBakedCutLibrary(): void {
  installed = {};
}

export function hasBakedCut(
  style: CutStyleId,
  rows: number,
  columns: number,
): boolean {
  const entries = installed[style]?.[`${rows}x${columns}`];
  return Boolean(entries && entries.length > 0);
}

export function biomorphicPiecesFrom(
  style: CutStyleId,
  rows: number,
  columns: number,
  boardWidth: number,
  boardHeight: number,
  seed: string,
  solve: () => PuzzlePieceDefinition[],
): PuzzlePieceDefinition[] {
  if (!hasBakedCut(style, rows, columns)) return solve();
  return generateBiomorphicPiecesFromTopology(
    topologyFromLibrary(installed, style, rows, columns, seed),
    boardWidth,
    boardHeight,
  );
}
