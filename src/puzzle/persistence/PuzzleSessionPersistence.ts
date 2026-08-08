import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  PieceRuntimeState,
  PuzzleEngineSnapshot,
} from '../types/engine';
import type { Point, Rect, Size } from '../types/geometry';
import type {
  ImageClipRegion,
  PuzzleCutDescriptor,
  PuzzleCutterId,
  PuzzleGuideMode,
  PuzzleImageSource,
  PuzzleLayout,
  PuzzlePieceDefinition,
} from '../types/layout';
import {
  DEFAULT_PUZZLE_GUIDE_MODE,
  type PuzzleDifficulty,
} from '../types/cutter';

const LEGACY_PUZZLE_SESSION_SCHEMA_VERSION = 1;
const PREVIOUS_PUZZLE_SESSION_SCHEMA_VERSION = 2;
export const PUZZLE_SESSION_SCHEMA_VERSION = 3;
export const PUZZLE_SESSION_STORAGE_KEY = '@frume/puzzle-session';

const MAX_PIECES = 1_000;
const MAX_STRING_LENGTH = 100_000;

export type PuzzleSessionSnapshot = {
  cutterId: PuzzleCutterId;
  difficulty: PuzzleDifficulty;
  guideMode?: PuzzleGuideMode;
  engine: PuzzleEngineSnapshot;
};

export type RestoredPuzzleSession = PuzzleSessionSnapshot & {
  savedAt: number;
};

export type PuzzleSessionLoadResult =
  | { status: 'loaded'; session: RestoredPuzzleSession }
  | { status: 'empty' }
  | { status: 'error'; error: unknown };

type PersistedPuzzleSession = RestoredPuzzleSession & {
  version: number;
};

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type PuzzleSessionPersistenceOptions = {
  key?: string;
  debounceMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isBoundedString(value: unknown, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_STRING_LENGTH &&
    (allowEmpty || value.length > 0)
  );
}

function isUnsplashHttpsUrl(value: unknown): value is string {
  if (!isBoundedString(value) || value.length > 2_048) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'unsplash.com' || url.hostname === 'www.unsplash.com')
    );
  } catch {
    return false;
  }
}

function isUnsplashImageHttpsUrl(value: unknown): value is string {
  if (!isBoundedString(value) || value.length > 2_048) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === 'images.unsplash.com' ||
        url.hostname === 'plus.unsplash.com')
    );
  } catch {
    return false;
  }
}

function parsePoint(value: unknown): Point | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function parseSize(value: unknown): Size | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return null;
  }
  return { width: value.width, height: value.height };
}

function parseRect(value: unknown): Rect | null {
  if (!isRecord(value)) {
    return null;
  }
  const point = parsePoint(value);
  const size = parseSize(value);
  return point && size ? { ...point, ...size } : null;
}

function parseClipRegion(value: unknown): ImageClipRegion | null {
  const rect = parseRect(value);
  return rect
    ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }
    : null;
}

function parseImage(value: unknown): PuzzleImageSource | null {
  if (!isRecord(value) || !isBoundedString(value.uri)) {
    return null;
  }
  const size = parseSize(value);
  if (!size) {
    return null;
  }
  const accessibilityLabel =
    value.accessibilityLabel === undefined
      ? undefined
      : isBoundedString(value.accessibilityLabel) &&
          value.accessibilityLabel.length <= 500
        ? value.accessibilityLabel
        : null;
  if (accessibilityLabel === null) {
    return null;
  }
  const remoteUri =
    value.remoteUri === undefined
      ? undefined
      : isUnsplashImageHttpsUrl(value.remoteUri)
        ? value.remoteUri
        : null;
  if (remoteUri === null) {
    return null;
  }
  if (value.attribution === undefined) {
    return {
      uri: value.uri,
      ...size,
      ...(remoteUri ? { remoteUri } : {}),
      ...(accessibilityLabel ? { accessibilityLabel } : {}),
    };
  }
  if (
    !isRecord(value.attribution) ||
    !isBoundedString(value.attribution.photographerName) ||
    value.attribution.photographerName.length > 256 ||
    value.attribution.sourceName !== 'Unsplash' ||
    !isUnsplashHttpsUrl(value.attribution.photographerUrl) ||
    !isUnsplashHttpsUrl(value.attribution.sourceUrl)
  ) {
    return null;
  }
  return {
    uri: value.uri,
    ...size,
    ...(remoteUri ? { remoteUri } : {}),
    ...(accessibilityLabel ? { accessibilityLabel } : {}),
    attribution: {
      photographerName: value.attribution.photographerName,
      photographerUrl: value.attribution.photographerUrl,
      sourceName: 'Unsplash',
      sourceUrl: value.attribution.sourceUrl,
    },
  };
}

function parseCutterId(value: unknown): PuzzleCutterId | null {
  return value === 'classic' ||
    value === 'organic' ||
    value === 'biomorphic' ||
    value === 'living-spectrum' ||
    value === 'crystal' ||
    value === 'crystal-quartered' ||
    value === 'amoeba' ||
    value === 'amoeba-columnar' ||
    value === 'fractal'
    ? value
    : null;
}

function parseDifficulty(value: unknown): PuzzleDifficulty | null {
  return value === 'easy' || value === 'medium' || value === 'hard'
    ? value
    : null;
}

function parseTrayPlacement(
  value: unknown,
): 'bottom' | 'right' | null {
  return value === 'bottom' || value === 'right' ? value : null;
}

function parseGuideMode(value: unknown): PuzzleGuideMode | null {
  return value === 'none' ||
    value === 'grid' ||
    value === 'cuts' ||
    value === 'image'
    ? value
    : null;
}

function parseCutDescriptor(value: unknown): PuzzleCutDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }
  const cutterId = parseCutterId(value.cutterId);
  if (
    !cutterId ||
    !isPositiveInteger(value.version) ||
    !isBoundedString(value.seed) ||
    !isPositiveInteger(value.rows) ||
    !isPositiveInteger(value.columns)
  ) {
    return null;
  }

  return {
    cutterId,
    version: value.version,
    seed: value.seed,
    rows: value.rows,
    columns: value.columns,
  };
}

function parsePieceDefinition(value: unknown): PuzzlePieceDefinition | null {
  if (
    !isRecord(value) ||
    !isBoundedString(value.id) ||
    !isNonNegativeInteger(value.index) ||
    !isNonNegativeInteger(value.row) ||
    !isNonNegativeInteger(value.col) ||
    !isBoundedString(value.path)
  ) {
    return null;
  }

  const bounds = parseRect(value.bounds);
  const clipRegion = parseClipRegion(value.clipRegion);
  const correctPosition = parsePoint(value.correctPosition);
  if (
    !bounds ||
    !clipRegion ||
    !correctPosition ||
    !isFiniteNumber(value.correctRotation) ||
    !Array.isArray(value.neighborIds) ||
    !value.neighborIds.every((id) => isBoundedString(id))
  ) {
    return null;
  }

  return {
    id: value.id,
    index: value.index,
    row: value.row,
    col: value.col,
    path: value.path,
    bounds,
    clipRegion,
    correctPosition,
    correctRotation: value.correctRotation,
    neighborIds: [...value.neighborIds],
  };
}

function parseLayout(value: unknown): PuzzleLayout | null {
  if (!isRecord(value)) {
    return null;
  }
  const cutterId = parseCutterId(value.cutterId);
  const image = parseImage(value.image);
  const boardSize = parseSize(value.boardSize);
  if (
    !cutterId ||
    !image ||
    !boardSize ||
    !Array.isArray(value.pieces) ||
    value.pieces.length === 0 ||
    value.pieces.length > MAX_PIECES
  ) {
    return null;
  }

  const pieces: PuzzlePieceDefinition[] = [];
  const pieceIds = new Set<string>();
  const pieceIndices = new Set<number>();
  for (const candidate of value.pieces) {
    const definition = parsePieceDefinition(candidate);
    if (
      !definition ||
      pieceIds.has(definition.id) ||
      pieceIndices.has(definition.index)
    ) {
      return null;
    }
    pieceIds.add(definition.id);
    pieceIndices.add(definition.index);
    pieces.push(definition);
  }

  if (
    pieces.some((definition) =>
      definition.neighborIds.some(
        (neighborId) =>
          neighborId === definition.id || !pieceIds.has(neighborId),
      ),
    )
  ) {
    return null;
  }

  let cutDescriptor: PuzzleCutDescriptor | undefined;
  if (value.cutDescriptor !== undefined) {
    const parsed = parseCutDescriptor(value.cutDescriptor);
    if (!parsed || parsed.cutterId !== cutterId) {
      return null;
    }
    cutDescriptor = parsed;
  }
  let trayPlacement: 'bottom' | 'right' | undefined;
  if (value.trayPlacement !== undefined) {
    const parsed = parseTrayPlacement(value.trayPlacement);
    if (!parsed) {
      return null;
    }
    trayPlacement = parsed;
  }

  return {
    cutterId,
    ...(trayPlacement ? { trayPlacement } : {}),
    ...(cutDescriptor ? { cutDescriptor } : {}),
    image,
    boardSize,
    pieces,
  };
}

function parseRuntimePiece(
  value: unknown,
  pieceId: string,
  pieceCount: number,
): PieceRuntimeState | null {
  if (
    !isRecord(value) ||
    value.pieceId !== pieceId ||
    !isFiniteNumber(value.rotation) ||
    typeof value.locked !== 'boolean' ||
    !isNonNegativeInteger(value.zIndex) ||
    typeof value.inTray !== 'boolean' ||
    !isNonNegativeInteger(value.traySlot) ||
    value.traySlot >= pieceCount
  ) {
    return null;
  }
  const position = parsePoint(value.position);
  if (!position || (value.locked && value.inTray)) {
    return null;
  }

  return {
    pieceId,
    position,
    rotation: value.rotation,
    locked: value.locked,
    zIndex: value.zIndex,
    inTray: value.inTray,
    traySlot: value.traySlot,
  };
}

function parseTimestamp(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return isFiniteNumber(value) && value >= 0 ? value : undefined;
}

function parseEngine(
  value: unknown,
  version: number,
  savedAt: number,
): PuzzleEngineSnapshot | null {
  if (
    !isRecord(value) ||
    (value.status !== 'ready' &&
      value.status !== 'playing' &&
      value.status !== 'completed') ||
    !isNonNegativeInteger(value.moveCount) ||
    !isRecord(value.pieces)
  ) {
    return null;
  }

  const layout = parseLayout(value.layout);
  const startedAt = parseTimestamp(value.startedAt);
  const completedAt = parseTimestamp(value.completedAt);
  if (!layout || startedAt === undefined || completedAt === undefined) {
    return null;
  }

  const expectedIds = new Set(layout.pieces.map((piece) => piece.id));
  const runtimeIds = Object.keys(value.pieces);
  if (
    runtimeIds.length !== expectedIds.size ||
    runtimeIds.some((pieceId) => !expectedIds.has(pieceId))
  ) {
    return null;
  }

  const pieces: Record<string, PieceRuntimeState> = {};
  const traySlots = new Set<number>();
  for (const definition of layout.pieces) {
    const runtime = parseRuntimePiece(
      value.pieces[definition.id],
      definition.id,
      layout.pieces.length,
    );
    if (!runtime || traySlots.has(runtime.traySlot)) {
      return null;
    }
    traySlots.add(runtime.traySlot);
    pieces[definition.id] = runtime;
  }

  const allLocked = layout.pieces.every(
    (definition) => pieces[definition.id].locked,
  );

  let activeElapsedMs: number;
  let activeStartedAt: number | null;
  if (version === LEGACY_PUZZLE_SESSION_SCHEMA_VERSION) {
    activeElapsedMs =
      value.status === 'ready' || startedAt === null
        ? 0
        : Math.max(
            0,
            (value.status === 'completed' && completedAt !== null
              ? completedAt
              : savedAt) - startedAt,
          );
    // A legacy timestamp cannot tell whether the process was foregrounded.
    // Treat the durable write as the end of its last known active interval.
    activeStartedAt = null;
  } else {
    if (
      !isFiniteNumber(value.activeElapsedMs) ||
      value.activeElapsedMs < 0
    ) {
      return null;
    }
    const parsedActiveStartedAt = parseTimestamp(value.activeStartedAt);
    if (parsedActiveStartedAt === undefined) {
      return null;
    }
    activeElapsedMs = value.activeElapsedMs;
    activeStartedAt = parsedActiveStartedAt;

    // An abrupt process termination may skip AppState background. Count only
    // through the last durable write, never the wall-clock gap until relaunch.
    if (value.status === 'playing' && activeStartedAt !== null) {
      activeElapsedMs += Math.max(0, savedAt - activeStartedAt);
      activeStartedAt = null;
    }
  }

  if (
    (value.status === 'ready' &&
      (startedAt !== null ||
        completedAt !== null ||
        activeElapsedMs !== 0 ||
        activeStartedAt !== null)) ||
    (value.status === 'playing' &&
      (startedAt === null || completedAt !== null)) ||
    (value.status === 'completed' &&
      (startedAt === null ||
        completedAt === null ||
        activeStartedAt !== null ||
        !allLocked))
  ) {
    return null;
  }

  return {
    status: value.status,
    layout,
    pieces,
    moveCount: value.moveCount,
    startedAt,
    completedAt,
    activeElapsedMs,
    activeStartedAt,
  };
}

function parsePersistedSession(value: unknown): PersistedPuzzleSession | null {
  if (
    !isRecord(value) ||
    (value.version !== LEGACY_PUZZLE_SESSION_SCHEMA_VERSION &&
      value.version !== PREVIOUS_PUZZLE_SESSION_SCHEMA_VERSION &&
      value.version !== PUZZLE_SESSION_SCHEMA_VERSION) ||
    !isFiniteNumber(value.savedAt) ||
    value.savedAt < 0
  ) {
    return null;
  }
  const cutterId = parseCutterId(value.cutterId);
  const difficulty = parseDifficulty(value.difficulty);
  const guideMode =
    value.version < PUZZLE_SESSION_SCHEMA_VERSION
      ? DEFAULT_PUZZLE_GUIDE_MODE
      : parseGuideMode(value.guideMode);
  const engine = parseEngine(value.engine, value.version, value.savedAt);
  if (
    !cutterId ||
    !difficulty ||
    !guideMode ||
    !engine ||
    engine.layout.cutterId !== cutterId
  ) {
    return null;
  }

  return {
    version: PUZZLE_SESSION_SCHEMA_VERSION,
    savedAt: value.savedAt,
    cutterId,
    difficulty,
    guideMode,
    engine,
  };
}

export function serializePuzzleSession(
  snapshot: PuzzleSessionSnapshot,
  savedAt = Date.now(),
): string {
  // Rebuild the engine object field-by-field. This remains safe even if a
  // future caller accidentally passes getState() rather than getSnapshot().
  const engine: PuzzleEngineSnapshot = {
    status: snapshot.engine.status,
    layout: snapshot.engine.layout,
    pieces: snapshot.engine.pieces,
    moveCount: snapshot.engine.moveCount,
    startedAt: snapshot.engine.startedAt,
    completedAt: snapshot.engine.completedAt,
    activeElapsedMs: snapshot.engine.activeElapsedMs,
    activeStartedAt: snapshot.engine.activeStartedAt,
  };
  const persisted: PersistedPuzzleSession = {
    version: PUZZLE_SESSION_SCHEMA_VERSION,
    savedAt,
    cutterId: snapshot.cutterId,
    difficulty: snapshot.difficulty,
    guideMode: snapshot.guideMode ?? DEFAULT_PUZZLE_GUIDE_MODE,
    engine,
  };
  return JSON.stringify(persisted);
}

/**
 * Parses storage as hostile input. Unsupported schema versions, partial
 * writes, invalid geometry, and runtime/layout ID mismatches are rejected.
 */
export function deserializePuzzleSession(
  serialized: string,
): RestoredPuzzleSession | null {
  try {
    const persisted = parsePersistedSession(JSON.parse(serialized));
    if (!persisted) {
      return null;
    }
    const { version: _version, ...restored } = persisted;
    return restored;
  } catch {
    return null;
  }
}

/**
 * Owns the write queue and debounce timer so a clear is always sequenced after
 * any write already in flight. Methods report failure instead of leaking an
 * unhandled native-storage rejection into the UI.
 */
export class PuzzleSessionPersistence {
  private readonly key: string;
  private readonly debounceMs: number;
  private readonly now: () => number;
  private readonly onError?: (error: unknown) => void;
  private operationQueue: Promise<void> = Promise.resolve();
  private pending: PuzzleSessionSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<boolean> | null = null;
  private clearEpoch = 0;

  constructor(
    private readonly storage: AsyncKeyValueStorage = AsyncStorage,
    options: PuzzleSessionPersistenceOptions = {},
  ) {
    this.key = options.key ?? PUZZLE_SESSION_STORAGE_KEY;
    this.debounceMs = options.debounceMs ?? 300;
    this.now = options.now ?? Date.now;
    this.onError = options.onError;
  }

  async load(): Promise<PuzzleSessionLoadResult> {
    return this.enqueue(async () => {
      try {
        const serialized = await this.storage.getItem(this.key);
        if (serialized === null) {
          return { status: 'empty' };
        }
        const restored = deserializePuzzleSession(serialized);
        if (!restored) {
          await this.storage.removeItem(this.key);
          return { status: 'empty' };
        }
        return { status: 'loaded', session: restored };
      } catch (error) {
        this.onError?.(error);
        return { status: 'error', error };
      }
    });
  }

  schedule(snapshot: PuzzleSessionSnapshot): void {
    this.pending = snapshot;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushPromise) {
      return this.flushPromise;
    }

    const flush = async (): Promise<boolean> => {
      while (this.pending) {
        const snapshot = this.pending;
        const epoch = this.clearEpoch;
        this.pending = null;
        const saved = await this.save(snapshot);
        if (!saved) {
          // Keep the newest unsaved snapshot available for a later lifecycle
          // flush. A concurrent clear must never resurrect old progress.
          if (this.clearEpoch === epoch && !this.pending) {
            this.pending = snapshot;
          }
          return false;
        }
      }
      await this.operationQueue;
      return true;
    };

    const promise = flush();
    this.flushPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.flushPromise === promise) {
        this.flushPromise = null;
      }
    }
  }

  async save(snapshot: PuzzleSessionSnapshot): Promise<boolean> {
    let serialized: string;
    try {
      serialized = serializePuzzleSession(snapshot, this.now());
    } catch (error) {
      this.onError?.(error);
      return false;
    }

    return this.enqueue(async () => {
      try {
        await this.storage.setItem(this.key, serialized);
        return true;
      } catch (error) {
        this.onError?.(error);
        return false;
      }
    });
  }

  async clear(): Promise<boolean> {
    this.clearEpoch += 1;
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    return this.enqueue(async () => {
      try {
        await this.storage.removeItem(this.key);
        return true;
      } catch (error) {
        this.onError?.(error);
        return false;
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
