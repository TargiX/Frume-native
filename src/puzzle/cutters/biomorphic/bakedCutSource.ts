import type { PuzzlePieceDefinition } from "../../types/layout";
import { topologyFromLibrary, type BakedCutLibrary } from "./bakedCutLibrary";
import type { CutStyleId } from "./cutStyles";
import { generateBiomorphicPiecesFromTopology } from "./generateBiomorphic";

/**
 * Where a cutter gets its cut from.
 *
 * Solving one takes tens of seconds on a laptop and minutes on a phone, so the
 * shipped path is a pre-generated library. A missing production asset is a
 * packaging failure, so it must fail immediately instead of running the
 * multi-minute synchronous solver on the UI thread.
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
  _solve: () => PuzzlePieceDefinition[],
): PuzzlePieceDefinition[] {
  if (!hasBakedCut(style, rows, columns)) {
    throw new Error(
      `Required baked ${style} cut for a ${rows}x${columns} board is unavailable`,
    );
  }
  return generateBiomorphicPiecesFromTopology(
    topologyFromLibrary(installed, style, rows, columns, seed),
    boardWidth,
    boardHeight,
  );
}
