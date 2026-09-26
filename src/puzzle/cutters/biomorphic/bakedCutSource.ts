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

export type BakedCutLibraries = Readonly<Record<number, BakedCutLibrary>>;
let installed: BakedCutLibraries = {};
let currentVersion: number | undefined;

/** Legacy single-library installation; useful for isolated cutter tests. */
export function installBakedCutLibrary(library: BakedCutLibrary): void {
  installed = { 1: library };
  currentVersion = undefined;
}

export function installBakedCutLibraries(
  libraries: BakedCutLibraries,
  version: number,
): void {
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !libraries[1] ||
    !libraries[version] ||
    Object.keys(libraries).some(
      key => !Number.isSafeInteger(Number(key)) || Number(key) < 1,
    )
  ) {
    throw new Error("Invalid baked cut catalog registration");
  }
  installed = { ...libraries };
  currentVersion = version;
}

/** New games pin the current pool; saved descriptors keep their own version. */
export function bakedLibraryDescriptorFields(): { bakedLibraryVersion?: number } {
  return currentVersion === undefined
    ? {}
    : { bakedLibraryVersion: currentVersion };
}

export function clearBakedCutLibrary(): void {
  installed = {};
  currentVersion = undefined;
}

export function hasBakedCut(
  style: CutStyleId,
  rows: number,
  columns: number,
): boolean {
  const entries = installed[currentVersion ?? 1]?.[style]?.[`${rows}x${columns}`];
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
  libraryVersion?: number,
): PuzzlePieceDefinition[] {
  // Versionless descriptors predate catalog versioning and must always use
  // the original pool, even when a newer one offers more cuts at this size.
  if (
    libraryVersion !== undefined &&
    (!Number.isSafeInteger(libraryVersion) || libraryVersion < 1)
  ) {
    throw new Error(`Invalid baked cut library version ${libraryVersion}`);
  }
  const library = installed[libraryVersion ?? 1];
  if (libraryVersion !== undefined && !library) {
    throw new Error(`Unsupported baked cut library version ${libraryVersion}`);
  }
  if (!library?.[style]?.[`${rows}x${columns}`]?.length) {
    throw new Error(
      `Required baked ${style} cut for a ${rows}x${columns} board is unavailable`,
    );
  }
  return generateBiomorphicPiecesFromTopology(
    topologyFromLibrary(library, style, rows, columns, seed),
    boardWidth,
    boardHeight,
  );
}
