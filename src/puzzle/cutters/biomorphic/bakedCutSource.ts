import type { PuzzlePieceDefinition } from "../../types/layout";
import type { BakedCut } from "./bakedCut";
import {
  gridKey,
  isRemoteBakedCut,
  pickBakedCutIndex,
  topologyFromLibrary,
  type BakedCutLibrary,
  type RemoteBakedCut,
} from "./bakedCutLibrary";
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
  installed = Object.fromEntries(
    Object.entries(libraries).map(([catalogVersion, library]) => [
      catalogVersion,
      Object.fromEntries(
        Object.entries(library).map(([style, grids]) => [
          style,
          Object.fromEntries(
            Object.entries(grids ?? {}).map(([grid, entries]) => [
              grid,
              entries ? [...entries] : entries,
            ]),
          ),
        ]),
      ),
    ]),
  );
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

/** Fetches, verifies and caches one remote payload. */
export type RemoteCutLoader = (
  ref: RemoteBakedCut["remote"],
) => Promise<BakedCut>;

let remoteLoader: RemoteCutLoader | undefined;
const inFlight = new Map<string, Promise<void>>();

export function installRemoteCutLoader(loader: RemoteCutLoader | undefined): void {
  remoteLoader = loader;
}

/** Raised when a board needs a cut that could not be fetched. */
export class RemoteCutUnavailableError extends Error {
  constructor(readonly reason: unknown) {
    super(
      "This size downloads its cut the first time. Connect to the internet and try again.",
    );
    this.name = "RemoteCutUnavailableError";
  }
}

/**
 * Makes sure the cut a seed lands on is in memory before the synchronous
 * cutter runs. Bundled cuts return at once; a remote one is loaded (from the
 * device cache or the network) and swapped into every installed catalog that
 * shares its key, so a saved puzzle and a new one never fetch it twice.
 */
export async function ensureBakedCut(
  style: CutStyleId,
  rows: number,
  columns: number,
  seed: string,
  libraryVersion?: number,
): Promise<void> {
  const entries = installed[libraryVersion ?? 1]?.[style]?.[gridKey(rows, columns)];
  if (!entries?.length) return;
  const entry = entries[pickBakedCutIndex(entries.length, rows, columns, seed).index];
  if (!isRemoteBakedCut(entry)) return;
  const { key } = entry.remote;
  let pending = inFlight.get(key);
  if (!pending) {
    const loader = remoteLoader;
    pending = (async () => {
      if (!loader) throw new RemoteCutUnavailableError(new Error("No cut loader"));
      let cut: BakedCut;
      try {
        cut = await loader(entry.remote);
      } catch (error) {
        throw new RemoteCutUnavailableError(error);
      }
      if (cut.rows !== rows || cut.columns !== columns) {
        throw new Error(`Downloaded cut ${key} is not ${gridKey(rows, columns)}`);
      }
      hydrateRemoteCut(key, cut);
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  await pending;
}

/** Replaces every placeholder for `key` with its payload. */
export function hydrateRemoteCut(key: string, cut: BakedCut): void {
  for (const library of Object.values(installed)) {
    for (const grids of Object.values(library)) {
      for (const entries of Object.values(grids ?? {})) {
        entries?.forEach((entry, index) => {
          if (isRemoteBakedCut(entry) && entry.remote.key === key) {
            entries[index] = cut;
          }
        });
      }
    }
  }
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
