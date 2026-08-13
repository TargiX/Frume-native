import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isPremiumCutter, usePremiumAccess } from '../../premium';
import { reconcileOwnPhotoOwnership } from '../../features/play/utils/ownPhotoLibrary';
import { getCutter } from '../cutters';
import { PuzzleEngine } from '../engine';
import { DEFAULT_PUZZLE_GUIDE_MODE } from '../types';
import {
  ExpoPuzzleImageFileStore,
  PuzzleCompletionPersistence,
  PuzzleImageCache,
  PuzzleSessionPersistence,
  completionReceiptFromSnapshot,
  type PuzzleCompletionReceipt,
  type PuzzleSessionLoadResult,
  type PuzzleSessionSnapshot,
} from '../persistence';
import type {
  CutOptions,
  PuzzleCutterId,
  PuzzleDifficulty,
  PuzzleGuideMode,
  PuzzleImageSource,
  PuzzleLayout,
  PuzzleTrayPlacement,
} from '../types';

export type PuzzleSession = {
  layout: PuzzleLayout;
  engine: PuzzleEngine;
  cutterId: PuzzleCutterId;
  difficulty: PuzzleDifficulty;
  guideMode?: PuzzleGuideMode;
};

export type StartPuzzleSessionParams = {
  image: PuzzleImageSource;
  cutterId?: PuzzleCutterId;
  difficulty: PuzzleDifficulty;
  guideMode?: PuzzleGuideMode;
  /** Initial solve-area bounds, resolved from the actual Game safe area. */
  boardMaxWidth: number;
  boardMaxHeight: number;
  /** Width of the table the shelf runs across; defaults to the board. */
  traySurfaceExtent?: number;
  trayPlacement?: PuzzleTrayPlacement;
};

export type PuzzleSessionStartResult =
  | { success: true; session: PuzzleSession }
  | { success: false; error: string };

/**
 * Opaque transaction returned while a replacement puzzle is awaiting its
 * required provider-use record. The previous engine is retained by identity,
 * so rollback never regenerates or mutates a completed puzzle.
 */
export type PuzzleSessionReplacement = {
  readonly previousSession: PuzzleSession | null;
  readonly nextSession: PuzzleSession;
  readonly requestId: number;
  readonly previousImageDurable: boolean;
  readonly nextImageDurable: boolean;
  durableReplaced: boolean;
  settled: boolean;
};

export type UsePuzzleSessionResult = {
  session: PuzzleSession | null;
  /** Last durably completed puzzle, retained independently from active progress. */
  completion: PuzzleCompletionReceipt | null;
  /** True while a newly finished board is crossing its durable commit boundary. */
  completionSaving: boolean;
  /** True only when the visible completion receipt is confirmed in storage. */
  completionDurable: boolean;
  /** The save remains intact, but premium access must be restored to play it. */
  sessionAccessBlocked: boolean;
  /** True only while a new cut is being generated. */
  loading: boolean;
  /** True until durable state has been checked once during provider startup. */
  restoring: boolean;
  error: string | null;
  persistenceError: string | null;
  /**
   * Reports whether a playable engine was installed. Callers must only enter
   * the Game screen when this resolves true.
   */
  startSession: (params: StartPuzzleSessionParams) => Promise<boolean>;
  /**
   * Prepares a guarded replacement without changing the active engine or save.
   * The caller commits only after required provider-use persistence succeeds.
   */
  beginSessionReplacement: (
    params: StartPuzzleSessionParams,
    expectedSession: PuzzleSession | null,
    isRequestCurrent: () => boolean,
  ) => Promise<PuzzleSessionReplacement | null>;
  commitSessionReplacement: (
    replacement: PuzzleSessionReplacement,
    isRequestCurrent: () => boolean,
  ) => Promise<boolean>;
  rollbackSessionReplacement: (
    replacement: PuzzleSessionReplacement,
  ) => Promise<boolean>;
  resizeSession: (params: {
    boardMaxWidth: number;
    boardMaxHeight: number;
    traySurfaceExtent?: number;
    trayPlacement: PuzzleTrayPlacement;
  }) => Promise<void>;
  /** Updates and durably schedules the board-help choice for this puzzle. */
  updateGuideMode: (mode: PuzzleGuideMode) => void;
  /** Keeps active-time accounting scoped to the visible Game screen. */
  setGameFocused: (focused: boolean) => void;
  /** Attempts to durably flush the exact active session again. */
  retrySave: () => Promise<boolean>;
  clearSession: () => void;
  clearCompletion: () => Promise<boolean>;
};

export const PREMIUM_CUTS_REQUIRED_ERROR =
  'Premium Cuts access is required for this cut style.';

function sessionSnapshot(session: PuzzleSession): PuzzleSessionSnapshot {
  return {
    cutterId: session.cutterId,
    difficulty: session.difficulty,
    guideMode: session.guideMode,
    engine: session.engine.getSnapshot(),
  };
}

function replaceSessionImage(
  session: PuzzleSession,
  image: PuzzleImageSource,
): PuzzleSession {
  if (session.layout.image === image) {
    return session;
  }
  const layout = { ...session.layout, image };
  const engine = PuzzleEngine.fromSnapshot({
    ...session.engine.getSnapshot(),
    layout,
  });
  return { ...session, layout, engine };
}

function haveSamePieceIds(current: PuzzleLayout, next: PuzzleLayout): boolean {
  if (current.pieces.length !== next.pieces.length) {
    return false;
  }
  const currentIds = new Set(current.pieces.map((piece) => piece.id));
  const nextIds = new Set(next.pieces.map((piece) => piece.id));
  return (
    currentIds.size === current.pieces.length &&
    nextIds.size === next.pieces.length &&
    next.pieces.every((piece) => currentIds.has(piece.id))
  );
}

function haveSameCutDescriptor(
  current: PuzzleLayout,
  next: PuzzleLayout,
): boolean {
  const a = current.cutDescriptor;
  const b = next.cutDescriptor;
  if (!a && !b) {
    return true;
  }
  return (
    !!a &&
    !!b &&
    a.cutterId === b.cutterId &&
    a.version === b.version &&
    a.seed === b.seed &&
    a.rows === b.rows &&
    a.columns === b.columns
  );
}

/**
 * Pure async boundary used by the hook. Keeping generation errors in a result
 * makes the "do not navigate without a session" contract explicit and
 * independently testable.
 */
export async function preparePuzzleSession(
  {
    image,
    cutterId = 'classic',
    difficulty,
    guideMode = DEFAULT_PUZZLE_GUIDE_MODE,
    boardMaxWidth,
    boardMaxHeight,
    traySurfaceExtent,
    trayPlacement = 'bottom',
  }: StartPuzzleSessionParams,
  resolveCutter = getCutter,
  premiumCutsUnlocked = false,
): Promise<PuzzleSessionStartResult> {
  if (isPremiumCutter(cutterId) && !premiumCutsUnlocked) {
    return {
      success: false,
      error: PREMIUM_CUTS_REQUIRED_ERROR,
    };
  }

  try {
    const cutter = resolveCutter(cutterId);
    const options: CutOptions = {
      difficulty,
      boardMaxWidth,
      boardMaxHeight,
      traySurfaceExtent,
      trayPlacement,
    };
    const layout = await cutter.generate(image, options);
    const engine = new PuzzleEngine(layout);
    return {
      success: true,
      session: { layout, engine, cutterId, difficulty, guideMode },
    };
  } catch (caught) {
    return {
      success: false,
      error: caught instanceof Error ? caught.message : 'Failed to create puzzle',
    };
  }
}

export async function recoverAndFlushPuzzleSession(
  session: PuzzleSession | null,
  persistence: Pick<PuzzleSessionPersistence, 'flush'>,
  now = Date.now(),
): Promise<boolean> {
  session?.engine.pause(now);
  session?.engine.recoverLoosePieces();
  return persistence.flush();
}

export async function loadPuzzleSessionForRestore(
  persistence: Pick<PuzzleSessionPersistence, 'load'>,
  imageCache: Pick<PuzzleImageCache, 'clear'>,
  isCurrent = () => true,
): Promise<PuzzleSessionLoadResult> {
  const result = await persistence.load();
  if (result.status === 'empty' && isCurrent()) {
    await imageCache.clear().catch(() => undefined);
  }
  return result;
}

/**
 * Completes the durable start transaction only while it still owns both the
 * request and installed engine. A newer start may cache its replacement image
 * while this flush is pending, so stale work must never prune cache slots.
 */
export async function finalizePuzzleSessionStart(
  imageUri: string,
  persistence: Pick<PuzzleSessionPersistence, 'flush'>,
  imageCache: Pick<PuzzleImageCache, 'retainOnly'>,
  isCurrent: () => boolean,
): Promise<{ current: boolean; saved: boolean }> {
  const saved = await persistence.flush();
  if (!isCurrent()) {
    return { current: false, saved };
  }
  if (saved) {
    await imageCache.retainOnly(imageUri).catch(() => undefined);
  }
  return { current: isCurrent(), saved };
}

/**
 * Promotes a restored completed session without ever deleting the only durable
 * copy first. A completion receipt must commit before the active snapshot is
 * cleared; otherwise the completed snapshot remains available for the next
 * launch to retry.
 */
export async function promoteRestoredCompletion(
  receipt: PuzzleCompletionReceipt,
  completionPersistence: Pick<PuzzleCompletionPersistence, 'save'>,
  persistence: Pick<PuzzleSessionPersistence, 'clear'>,
  imageCache: Pick<PuzzleImageCache, 'clearAfter'>,
): Promise<{ completionSaved: boolean; activeCleared: boolean }> {
  const completionSaved = await completionPersistence.save(receipt);
  if (!completionSaved) {
    return { completionSaved: false, activeCleared: false };
  }

  const activeCleared = await imageCache
    .clearAfter(persistence.clear())
    .catch(() => false);
  return { completionSaved: true, activeCleared };
}

/**
 * Commits the completed engine before its compact receipt. If the process
 * exits between those writes, startup can promote the completed snapshot; it
 * can never restore an older in-progress snapshot beside a newer receipt.
 */
export async function persistLiveCompletion(
  snapshot: PuzzleSessionSnapshot,
  receipt: PuzzleCompletionReceipt,
  persistence: Pick<PuzzleSessionPersistence, 'schedule' | 'flush'>,
  completionPersistence: Pick<PuzzleCompletionPersistence, 'save'>,
  isCurrentCompletion = () => true,
): Promise<{ progressSaved: boolean; completionSaved: boolean }> {
  persistence.schedule(snapshot);
  const progressSaved = await persistence.flush();
  if (!progressSaved || !isCurrentCompletion()) {
    return { progressSaved, completionSaved: false };
  }

  const completionSaved = await completionPersistence.save(receipt);
  return { progressSaved: true, completionSaved };
}

export function isPuzzleSessionReplacementCurrent(
  replacement: PuzzleSessionReplacement,
  currentSession: PuzzleSession | null,
  currentRequestId: number,
): boolean {
  return (
    !replacement.settled &&
    replacement.requestId === currentRequestId &&
    currentSession?.engine === replacement.previousSession?.engine
  );
}

export function syncPuzzleSessionActivity(
  session: PuzzleSession | null,
  gameFocused: boolean,
  appState: AppStateStatus,
  now = Date.now(),
): void {
  if (gameFocused && appState === 'active') {
    session?.engine.resume(now);
    return;
  }
  session?.engine.pause(now);
}

export function mustPreserveCompletedSessionSnapshot(
  session: PuzzleSession | null,
  visibleCompletion: PuzzleCompletionReceipt | null,
  durableCompletion: PuzzleCompletionReceipt | null,
): boolean {
  return Boolean(
    session?.engine.isComplete() &&
      visibleCompletion &&
      visibleCompletion !== durableCompletion,
  );
}

export type CompletedSnapshotClearRetention = {
  requestId: number;
  imageUri: string;
};

/**
 * Protects the image referenced by a completed active snapshot while its
 * durable clear is pending. Receipt removal may run independently; ownership
 * must not be released until the snapshot clear has actually succeeded.
 */
export function beginCompletedSnapshotClearRetention(
  session: PuzzleSession | null,
  requestId: number,
): CompletedSnapshotClearRetention | null {
  return session?.engine.isComplete()
    ? { requestId, imageUri: session.layout.image.uri }
    : null;
}

export function finishCompletedSnapshotClearRetention(
  retention: CompletedSnapshotClearRetention | null,
  requestId: number,
  cleared: boolean,
): CompletedSnapshotClearRetention | null {
  return cleared && retention?.requestId === requestId ? null : retention;
}

export function retainFailedPromotedCompletionClear(
  receipt: PuzzleCompletionReceipt,
  requestId: number,
  promotion: { completionSaved: boolean; activeCleared: boolean },
): CompletedSnapshotClearRetention | null {
  return promotion.completionSaved && !promotion.activeCleared
    ? { requestId, imageUri: receipt.image.uri }
    : null;
}

export type CompletionRemovalResult =
  | 'cleared'
  | 'snapshot_failed'
  | 'receipt_failed'
  | 'stale';

/** Clears the active completed snapshot before its receipt can be removed. */
export async function removeCompletionDurably(
  clearActiveSnapshot: (() => Promise<boolean>) | null,
  clearReceipt: () => Promise<boolean>,
  isCurrentReceipt: () => boolean,
): Promise<CompletionRemovalResult> {
  if (clearActiveSnapshot && !(await clearActiveSnapshot())) {
    return 'snapshot_failed';
  }
  if (!isCurrentReceipt()) {
    return 'stale';
  }
  if (!(await clearReceipt())) {
    return 'receipt_failed';
  }
  return isCurrentReceipt() ? 'cleared' : 'stale';
}

export function usePuzzleSession(): UsePuzzleSessionResult {
  const { isPremium, verifyPremiumCuts } = usePremiumAccess();
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [completion, setCompletion] =
    useState<PuzzleCompletionReceipt | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionDurable, setCompletionDurable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const sessionRef = useRef<PuzzleSession | null>(null);
  const completionRef = useRef<PuzzleCompletionReceipt | null>(null);
  /** Last receipt confirmed in storage; optimistic UI is tracked separately. */
  const durableCompletionRef = useRef<PuzzleCompletionReceipt | null>(null);
  const preservedCompletedImageRef = useRef<string | null>(null);
  const completedSnapshotClearRetentionRef =
    useRef<CompletedSnapshotClearRetention | null>(null);
  const completedSnapshotClearPromiseRef = useRef<{
    requestId: number;
    promise: Promise<boolean>;
  } | null>(null);
  const unsubscribeEngineRef = useRef<(() => void) | null>(null);
  const resizeRequestId = useRef(0);
  const sessionRequestId = useRef(0);
  const mountedRef = useRef(true);
  const imageDurableRef = useRef(true);
  const gameFocusedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const persistenceRef = useRef<PuzzleSessionPersistence | null>(null);
  const completionPersistenceRef =
    useRef<PuzzleCompletionPersistence | null>(null);
  const imageCacheRef = useRef<PuzzleImageCache | null>(null);

  if (!persistenceRef.current) {
    persistenceRef.current = new PuzzleSessionPersistence(undefined, {
      onError: () => {
        if (mountedRef.current) {
          setPersistenceError('Progress could not be saved on this device');
        }
      },
    });
  }
  const persistence = persistenceRef.current;
  if (!completionPersistenceRef.current) {
    completionPersistenceRef.current = new PuzzleCompletionPersistence(
      undefined,
      {
        onError: () => {
          if (mountedRef.current) {
            setPersistenceError('Completed puzzle could not be saved');
          }
        },
      },
    );
  }
  const completionPersistence = completionPersistenceRef.current;
  if (!imageCacheRef.current) {
    imageCacheRef.current = new PuzzleImageCache(
      new ExpoPuzzleImageFileStore(),
    );
  }
  const imageCache = imageCacheRef.current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const installSession = useCallback(
    (nextSession: PuzzleSession) => {
      unsubscribeEngineRef.current?.();
      syncPuzzleSessionActivity(
        nextSession,
        gameFocusedRef.current,
        appStateRef.current,
      );
      sessionRef.current = nextSession;
      setSession(nextSession);
      setPersistenceError(null);

      let previousStatus = nextSession.engine.getState().status;
      const scheduleCurrentState = () => {
        const current = sessionRef.current;
        if (!current || current.engine !== nextSession.engine) {
          return;
        }
        const status = current.engine.getState().status;
        if (status === 'completed') {
          if (previousStatus !== 'completed') {
            const receipt = completionReceiptFromSnapshot(
              current.engine.getSnapshot(),
              current.cutterId,
              current.difficulty,
            );
            completionRef.current = receipt;
            setCompletion(receipt);
            setCompletionDurable(false);
            setCompletionSaving(true);
            void persistLiveCompletion(
              sessionSnapshot(current),
              receipt,
              persistence,
              completionPersistence,
              () => completionRef.current === receipt,
            ).then(async ({ progressSaved, completionSaved }) => {
              const stillCurrentCompletion =
                completionRef.current === receipt;
              if (!progressSaved || !completionSaved) {
                if (stillCurrentCompletion && mountedRef.current) {
                  setCompletionSaving(false);
                  setPersistenceError('Completed puzzle could not be saved');
                }
                return;
              }
              durableCompletionRef.current = receipt;
              if (stillCurrentCompletion && mountedRef.current) {
                setCompletionDurable(true);
                setCompletionSaving(false);
                setPersistenceError(null);
              }
              await reconcileOwnPhotoOwnership([
                sessionRef.current?.layout.image.uri,
                completionRef.current?.image.uri,
                durableCompletionRef.current?.image.uri,
                preservedCompletedImageRef.current ?? undefined,
                completedSnapshotClearRetentionRef.current?.imageUri,
              ]).catch(() => undefined);
            });
          }
          previousStatus = status;
          return;
        }
        previousStatus = status;
        persistence.schedule(sessionSnapshot(current));
      };

      unsubscribeEngineRef.current =
        nextSession.engine.subscribe(scheduleCurrentState);
      scheduleCurrentState();
    },
    [completionPersistence, persistence],
  );

  useEffect(() => {
    let cancelled = false;
    const requestId = ++sessionRequestId.current;

    void Promise.all([
      loadPuzzleSessionForRestore(
        persistence,
        imageCache,
        () => !cancelled && requestId === sessionRequestId.current,
      ),
      completionPersistence.load(),
    ])
      .then(async ([loadResult, completionLoadResult]) => {
        if (cancelled || requestId !== sessionRequestId.current) {
          return;
        }
        if (completionLoadResult.status === 'loaded') {
          completionRef.current = completionLoadResult.receipt;
          durableCompletionRef.current = completionLoadResult.receipt;
          setCompletion(completionLoadResult.receipt);
          setCompletionDurable(true);
          setCompletionSaving(false);
        } else if (completionLoadResult.status === 'error') {
          setPersistenceError('Completed puzzle could not be restored');
        }
        if (loadResult.status === 'error') {
          setPersistenceError('Saved puzzle could not be restored');
          return;
        }
        if (loadResult.status === 'corrupt') {
          imageDurableRef.current = true;
          await imageCache.clear().catch(() => undefined);
          await reconcileOwnPhotoOwnership([
            completionRef.current?.image.uri,
            durableCompletionRef.current?.image.uri,
            preservedCompletedImageRef.current ?? undefined,
            completedSnapshotClearRetentionRef.current?.imageUri,
          ]).catch(() => undefined);
          setPersistenceError(
            'Saved puzzle was damaged and could not be restored. You can start a new one.',
          );
          return;
        }
        if (loadResult.status === 'empty') {
          imageDurableRef.current = true;
          await reconcileOwnPhotoOwnership([
            completionRef.current?.image.uri,
            durableCompletionRef.current?.image.uri,
            preservedCompletedImageRef.current ?? undefined,
            completedSnapshotClearRetentionRef.current?.imageUri,
          ]).catch(() => undefined);
          return;
        }
        const restored = loadResult.session;
        if (restored.engine.status === 'completed') {
          imageDurableRef.current = true;
          const resolved = await imageCache.resolveForRestore(
            restored.engine.layout.image,
          );
          const receipt = completionReceiptFromSnapshot(
            {
              ...restored.engine,
              layout: {
                ...restored.engine.layout,
                image: resolved.image,
              },
            },
            restored.cutterId,
            restored.difficulty,
            restored.savedAt,
          );
          completionRef.current = receipt;
          setCompletion(receipt);
          setCompletionSaving(true);
          setCompletionDurable(false);
          const promotion = await promoteRestoredCompletion(
            receipt,
            completionPersistence,
            persistence,
            imageCache,
          );
          const restoreStillCurrent =
            !cancelled && requestId === sessionRequestId.current;
          if (!restoreStillCurrent) {
            return;
          }
          if (promotion.completionSaved) {
            durableCompletionRef.current = receipt;
          }
          if (mountedRef.current) {
            setCompletionSaving(false);
            setCompletionDurable(promotion.completionSaved);
          }
          preservedCompletedImageRef.current = promotion.activeCleared
            ? null
            : receipt.image.uri;
          completedSnapshotClearRetentionRef.current =
            retainFailedPromotedCompletionClear(
              receipt,
              requestId,
              promotion,
            );
          if (!promotion.completionSaved) {
            const restoredLayout = {
              ...restored.engine.layout,
              image: resolved.image,
            };
            const restoredSession: PuzzleSession = {
              layout: restoredLayout,
              engine: PuzzleEngine.fromSnapshot({
                ...restored.engine,
                layout: restoredLayout,
              }),
              cutterId: restored.cutterId,
              difficulty: restored.difficulty,
              guideMode:
                restored.guideMode ?? DEFAULT_PUZZLE_GUIDE_MODE,
            };
            imageDurableRef.current = resolved.durable;
            installSession(restoredSession);
          }
          if (!promotion.completionSaved && mountedRef.current) {
            setPersistenceError('Completed puzzle could not be saved');
          } else if (!promotion.activeCleared && mountedRef.current) {
            setPersistenceError(
              'Completed puzzle was saved, but old progress could not be cleared',
            );
          }
          await reconcileOwnPhotoOwnership([
            receipt.image.uri,
            durableCompletionRef.current?.image.uri,
            preservedCompletedImageRef.current ?? undefined,
            completedSnapshotClearRetentionRef.current?.imageUri,
          ]).catch(() => undefined);
          return;
        }
        let resolvedImage = {
          image: restored.engine.layout.image,
          durable: false,
        };
        try {
          resolvedImage = await imageCache.resolveForRestore(
            restored.engine.layout.image,
          );
        } catch {
          const remoteUri = restored.engine.layout.image.remoteUri;
          if (remoteUri) {
            resolvedImage = {
              image: {
                ...restored.engine.layout.image,
                uri: remoteUri,
              },
              durable: false,
            };
          }
        }
        if (cancelled || requestId !== sessionRequestId.current) {
          return;
        }
        const restoredLayout = {
          ...restored.engine.layout,
          image: resolvedImage.image,
        };
        const engine = PuzzleEngine.fromSnapshot({
          ...restored.engine,
          layout: restoredLayout,
        });
        const restoredSession: PuzzleSession = {
          layout: restoredLayout,
          engine,
          cutterId: restored.cutterId,
          difficulty: restored.difficulty,
          guideMode:
            restored.guideMode ?? DEFAULT_PUZZLE_GUIDE_MODE,
        };
        imageDurableRef.current = resolvedImage.durable;
        installSession(restoredSession);
        const completion = await finalizePuzzleSessionStart(
          restoredSession.layout.image.uri,
          persistence,
          imageCache,
          () =>
            !cancelled &&
            requestId === sessionRequestId.current &&
            sessionRef.current?.engine === restoredSession.engine,
        );
        if (!completion.current) {
          return;
        }
        await reconcileOwnPhotoOwnership([
          restoredSession.layout.image.uri,
          completionRef.current?.image.uri,
          durableCompletionRef.current?.image.uri,
          preservedCompletedImageRef.current ?? undefined,
          completedSnapshotClearRetentionRef.current?.imageUri,
        ]).catch(() => undefined);
        if (!resolvedImage.durable && mountedRef.current) {
          setPersistenceError(
            'Saved photo is available online only until it can be cached again',
          );
        }
      })
      .catch(() => {
        if (!cancelled && requestId === sessionRequestId.current) {
          setPersistenceError('Saved puzzle could not be restored');
        }
      })
      .finally(() => {
        if (!cancelled && requestId === sessionRequestId.current) {
          setRestoring(false);
        }
      });

    return () => {
      cancelled = true;
      sessionRequestId.current += 1;
      resizeRequestId.current += 1;
      sessionRef.current?.engine.pause();
      sessionRef.current?.engine.recoverLoosePieces();
      unsubscribeEngineRef.current?.();
      unsubscribeEngineRef.current = null;
      sessionRef.current = null;
      void persistence.flush();
    };
  }, [completionPersistence, imageCache, installSession, persistence]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        syncPuzzleSessionActivity(
          sessionRef.current,
          gameFocusedRef.current,
          nextState,
        );
        return;
      }
      if (nextState === 'inactive' || nextState === 'background') {
        const current = sessionRef.current;
        void recoverAndFlushPuzzleSession(
          current,
          persistence,
        ).then((saved) => {
          if (
            saved &&
            imageDurableRef.current &&
            mountedRef.current &&
            sessionRef.current?.engine === current?.engine
          ) {
            setPersistenceError(null);
          }
        });
        return;
      }
      syncPuzzleSessionActivity(
        sessionRef.current,
        gameFocusedRef.current,
        nextState,
      );
    });
    return () => subscription.remove();
  }, [persistence]);

  const setGameFocused = useCallback(
    (focused: boolean) => {
      gameFocusedRef.current = focused;
      const current = sessionRef.current;
      if (focused && appStateRef.current === 'active') {
        syncPuzzleSessionActivity(current, focused, appStateRef.current);
        return;
      }

      void recoverAndFlushPuzzleSession(current, persistence).then((saved) => {
        if (
          saved &&
          imageDurableRef.current &&
          mountedRef.current &&
          sessionRef.current?.engine === current?.engine
        ) {
          setPersistenceError(null);
        }
      });
    },
    [persistence],
  );

  const beginSessionReplacement = useCallback(
    async (
      {
        image,
        cutterId = 'classic',
        difficulty,
        guideMode = DEFAULT_PUZZLE_GUIDE_MODE,
        boardMaxWidth,
        boardMaxHeight,
        traySurfaceExtent,
        trayPlacement = 'bottom',
      }: StartPuzzleSessionParams,
      expectedSession: PuzzleSession | null,
      isRequestCurrent: () => boolean,
    ): Promise<PuzzleSessionReplacement | null> => {
      const requestId = ++sessionRequestId.current;
      resizeRequestId.current += 1;
      const previousImageDurable = imageDurableRef.current;
      const stillOwnsReplacement = () =>
        requestId === sessionRequestId.current &&
        sessionRef.current?.engine === expectedSession?.engine &&
        isRequestCurrent();

      if (!stillOwnsReplacement()) {
        return null;
      }

      setLoading(true);
      setRestoring(false);
      setError(null);
      try {
        const premiumCutsUnlocked = isPremiumCutter(cutterId)
          ? await verifyPremiumCuts()
          : false;
        if (!stillOwnsReplacement()) {
          return null;
        }
        const result = await preparePuzzleSession(
          {
            image,
            cutterId,
            difficulty,
            guideMode,
            boardMaxWidth,
            boardMaxHeight,
            traySurfaceExtent,
            trayPlacement,
          },
          getCutter,
          premiumCutsUnlocked,
        );
        if (!stillOwnsReplacement()) {
          return null;
        }
        if (!result.success) {
          setError(result.error);
          return null;
        }

        let cachedImage = { image, durable: false };
        try {
          cachedImage = await imageCache.cacheForReplacement(
            image,
            expectedSession?.layout.image.uri,
          );
        } catch {
          // The online source remains playable; commit reports the warning.
        }
        if (!stillOwnsReplacement()) {
          return null;
        }

        const nextSession = replaceSessionImage(
          result.session,
          cachedImage.image,
        );
        return {
          previousSession: expectedSession,
          nextSession,
          requestId,
          previousImageDurable,
          nextImageDurable: cachedImage.durable,
          durableReplaced: false,
          settled: false,
        };
      } catch (caught) {
        if (stillOwnsReplacement()) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Failed to create puzzle',
          );
        }
        return null;
      } finally {
        if (requestId === sessionRequestId.current) {
          setLoading(false);
        }
      }
    },
    [imageCache, verifyPremiumCuts],
  );

  const commitSessionReplacement = useCallback(
    async (
      replacement: PuzzleSessionReplacement,
      isRequestCurrent: () => boolean,
    ): Promise<boolean> => {
      const isCurrent = () =>
        isPuzzleSessionReplacementCurrent(
          replacement,
          sessionRef.current,
          sessionRequestId.current,
        ) && isRequestCurrent();
      if (!isCurrent()) {
        return false;
      }

      // Commit the exact replacement snapshot before exposing its engine. If
      // the process exits here, restore sees the whole next session; if this
      // write fails, the player remains on the prior board/setup screen.
      const replaceResult = await persistence.replaceGuarded(
        sessionSnapshot(replacement.nextSession),
        replacement.previousSession
          ? sessionSnapshot(replacement.previousSession)
          : null,
        isCurrent,
      );
      replacement.durableReplaced =
        replaceResult === 'committed' || replaceResult === 'rollback_failed';
      if (replaceResult !== 'committed' || !isCurrent()) {
        if (mountedRef.current) {
          if (replaceResult === 'failed' || replaceResult === 'rollback_failed') {
            setPersistenceError('Progress could not be saved on this device');
          }
        }
        return false;
      }

      replacement.settled = true;
      preservedCompletedImageRef.current = null;
      completedSnapshotClearRetentionRef.current = null;
      imageDurableRef.current = replacement.nextImageDurable;
      installSession(replacement.nextSession);
      await imageCache
        .retainOnly(replacement.nextSession.layout.image.uri)
        .catch(() => undefined);
      await reconcileOwnPhotoOwnership([
        replacement.nextSession.layout.image.uri,
        completionRef.current?.image.uri,
        durableCompletionRef.current?.image.uri,
      ]).catch(() => undefined);
      if (!replacement.nextImageDurable && mountedRef.current) {
        setPersistenceError(
          'Photo could not be cached for offline play; progress still saves',
        );
      } else if (mountedRef.current) {
        setPersistenceError(null);
      }
      return true;
    },
    [imageCache, installSession, persistence],
  );

  const rollbackSessionReplacement = useCallback(
    async (replacement: PuzzleSessionReplacement): Promise<boolean> => {
      if (
        !isPuzzleSessionReplacementCurrent(
          replacement,
          sessionRef.current,
          sessionRequestId.current,
        )
      ) {
        return false;
      }

      // A prepared replacement has not touched the active engine or durable
      // snapshot. Rollback therefore only releases its staged image/own-photo
      // candidate and invalidates the transaction generation.
      let durableRestored = true;
      if (replacement.durableReplaced) {
        durableRestored = replacement.previousSession
          ? await persistence.replace(
              sessionSnapshot(replacement.previousSession),
            )
          : await persistence.clear();
      }
      replacement.settled = true;
      sessionRequestId.current += 1;
      resizeRequestId.current += 1;
      const previousUri = replacement.previousSession?.layout.image.uri;
      if (previousUri && durableRestored) {
        await imageCache.retainOnly(previousUri).catch(() => undefined);
      } else if (!previousUri && durableRestored) {
        await imageCache.clear().catch(() => undefined);
      }
      await reconcileOwnPhotoOwnership([
        previousUri,
        // The setup screen still owns its staged candidate after a successful
        // rollback so it can retry. If durable rollback failed, storage may
        // also still point at it. Screen-unmount cleanup releases the exact
        // candidate when the UI owner actually abandons setup.
        replacement.nextSession.layout.image.uri,
        completionRef.current?.image.uri,
        durableCompletionRef.current?.image.uri,
      ]).catch(() => undefined);
      imageDurableRef.current = replacement.previousImageDurable;
      if (mountedRef.current) {
        setLoading(false);
        setError(null);
        if (!durableRestored) {
          setPersistenceError('Progress could not be saved on this device');
        }
      }
      return durableRestored;
    },
    [imageCache, persistence],
  );

  const startSession = useCallback(
    async (params: StartPuzzleSessionParams): Promise<boolean> => {
      const replacement = await beginSessionReplacement(
        params,
        sessionRef.current,
        () => mountedRef.current,
      );
      if (!replacement) {
        return false;
      }
      const committed = await commitSessionReplacement(
        replacement,
        () => mountedRef.current,
      );
      if (!committed) {
        await rollbackSessionReplacement(replacement).catch(() => false);
      }
      return committed;
    },
    [
      beginSessionReplacement,
      commitSessionReplacement,
      rollbackSessionReplacement,
    ],
  );

  const resizeSession = useCallback(
    async ({
      boardMaxWidth,
      boardMaxHeight,
      traySurfaceExtent,
      trayPlacement,
    }: {
      boardMaxWidth: number;
      boardMaxHeight: number;
      traySurfaceExtent?: number;
      trayPlacement: PuzzleTrayPlacement;
    }) => {
      const current = sessionRef.current;
      if (!current) {
        return;
      }
      if (
        Math.abs(current.layout.boardSize.width - boardMaxWidth) < 0.5 &&
        Math.abs(current.layout.boardSize.height - boardMaxHeight) < 0.5 &&
        Math.abs(
          (current.layout.traySurfaceExtent ?? 0) - (traySurfaceExtent ?? 0),
        ) < 0.5 &&
        (current.layout.trayPlacement ?? 'bottom') === trayPlacement
      ) {
        return;
      }

      const requestId = ++resizeRequestId.current;
      try {
        const cutter = getCutter(current.cutterId);
        const options: CutOptions = {
          difficulty: current.difficulty,
          boardMaxWidth,
          boardMaxHeight,
          traySurfaceExtent,
          trayPlacement,
          cutDescriptor: current.layout.cutDescriptor,
        };
        const layout = await cutter.generate(current.layout.image, options);
        const latest = sessionRef.current;
        if (
          requestId !== resizeRequestId.current ||
          !latest ||
          latest.engine !== current.engine
        ) {
          return;
        }
        if (
          layout.cutterId !== current.cutterId ||
          !haveSamePieceIds(current.layout, layout) ||
          !haveSameCutDescriptor(current.layout, layout)
        ) {
          throw new Error('Puzzle cutter changed its stable cut during resize');
        }

        latest.engine.relayout(layout);
        const nextSession = { ...latest, layout };
        sessionRef.current = nextSession;
        setError(null);
        setSession(nextSession);
      } catch (caught) {
        if (requestId === resizeRequestId.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Failed to resize puzzle',
          );
        }
      }
    },
    [],
  );

  const updateGuideMode = useCallback(
    (mode: PuzzleGuideMode) => {
      const current = sessionRef.current;
      if (!current || current.guideMode === mode) {
        return;
      }
      const nextSession = { ...current, guideMode: mode };
      sessionRef.current = nextSession;
      setSession(nextSession);
      persistence.schedule(sessionSnapshot(nextSession));
    },
    [persistence],
  );

  const retrySave = useCallback(async (): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current) {
      return false;
    }

    persistence.schedule(sessionSnapshot(current));
    const saved = await persistence.flush();
    if (
      !mountedRef.current ||
      sessionRef.current?.engine !== current.engine
    ) {
      return false;
    }

    if (!saved) {
      setPersistenceError('Progress could not be saved on this device');
      return false;
    }
    const completionReceipt = current.engine.isComplete()
      ? completionRef.current
      : null;
    if (completionReceipt) {
      setCompletionSaving(true);
      const completionSaved = await completionPersistence
        .save(completionReceipt)
        .finally(() => {
          if (
            mountedRef.current &&
            completionRef.current === completionReceipt
          ) {
            setCompletionSaving(false);
          }
        });
      if (
        !completionSaved &&
        mountedRef.current &&
        completionRef.current === completionReceipt
      ) {
        setPersistenceError('Completed puzzle could not be saved');
        return false;
      }
      if (completionSaved) {
        durableCompletionRef.current = completionReceipt;
        setCompletionDurable(true);
      }
    }
    if (!imageDurableRef.current) {
      setPersistenceError(
        'Photo could not be cached for offline play; progress still saves',
      );
      return true;
    }
    setPersistenceError(null);
    return true;
  }, [completionPersistence, persistence]);

  const clearPersistedSession = useCallback(
    (
      requestId: number,
      retention: CompletedSnapshotClearRetention | null,
    ): Promise<boolean> => {
      const pending = completedSnapshotClearPromiseRef.current;
      if (retention && pending?.requestId === retention.requestId) {
        return pending.promise;
      }

      const promise = imageCache
        .clearAfter(
          persistence.clearIf(
            () =>
              requestId === sessionRequestId.current &&
              sessionRef.current === null &&
              (!retention ||
                completedSnapshotClearRetentionRef.current === retention),
          ),
        )
        .then(async (cleared) => {
          if (retention) {
            if (
              cleared &&
              preservedCompletedImageRef.current === retention.imageUri
            ) {
              preservedCompletedImageRef.current = null;
            }
            completedSnapshotClearRetentionRef.current =
              finishCompletedSnapshotClearRetention(
                completedSnapshotClearRetentionRef.current,
                requestId,
                cleared,
              );
          }
          if (cleared) {
            await reconcileOwnPhotoOwnership([
              sessionRef.current?.layout.image.uri,
              completionRef.current?.image.uri,
              durableCompletionRef.current?.image.uri,
              preservedCompletedImageRef.current ?? undefined,
              completedSnapshotClearRetentionRef.current?.imageUri,
            ]).catch(() => undefined);
          } else if (
            mountedRef.current &&
            requestId === sessionRequestId.current &&
            sessionRef.current === null &&
            (!retention ||
              completedSnapshotClearRetentionRef.current === retention)
          ) {
            setPersistenceError(
              'Progress could not be removed from this device',
            );
          }
          if (
            cleared &&
            requestId === sessionRequestId.current &&
            mountedRef.current
          ) {
            setPersistenceError(null);
          }
          return cleared;
        })
        .catch(() => {
          if (
            mountedRef.current &&
            requestId === sessionRequestId.current &&
            sessionRef.current === null &&
            (!retention ||
              completedSnapshotClearRetentionRef.current === retention)
          ) {
            setPersistenceError(
              'Progress could not be removed from this device',
            );
          }
          return false;
        })
        .finally(() => {
          if (completedSnapshotClearPromiseRef.current?.promise === promise) {
            completedSnapshotClearPromiseRef.current = null;
          }
        });

      if (retention) {
        completedSnapshotClearPromiseRef.current = { requestId, promise };
      }
      return promise;
    },
    [imageCache, persistence],
  );

  const clearSession = useCallback(() => {
    const current = sessionRef.current;
    const existingRetention = completedSnapshotClearRetentionRef.current;
    if (!current && existingRetention) {
      // Navigation may emit beforeRemove after an explicit action has already
      // requested the same clear. Reuse that generation and promise instead of
      // making the first clear stale. If the receipt is still crossing its
      // durable boundary, the effect below will clear immediately afterward.
      if (
        !completionRef.current ||
        durableCompletionRef.current === completionRef.current
      ) {
        void clearPersistedSession(
          existingRetention.requestId,
          existingRetention,
        );
      }
      return;
    }
    const preserveCompletedSnapshot = mustPreserveCompletedSessionSnapshot(
      current,
      completionRef.current,
      durableCompletionRef.current,
    );
    const requestId = ++sessionRequestId.current;
    const completedSnapshotClearRetention =
      beginCompletedSnapshotClearRetention(current, requestId);
    if (completedSnapshotClearRetention) {
      completedSnapshotClearRetentionRef.current =
        completedSnapshotClearRetention;
    }
    resizeRequestId.current += 1;
    unsubscribeEngineRef.current?.();
    unsubscribeEngineRef.current = null;
    sessionRef.current = null;
    imageDurableRef.current = true;
    setSession(null);
    setLoading(false);
    setRestoring(false);
    setError(null);
    if (preserveCompletedSnapshot) {
      preservedCompletedImageRef.current = current?.layout.image.uri ?? null;
      void reconcileOwnPhotoOwnership([
        current?.layout.image.uri,
        completionRef.current?.image.uri,
        durableCompletionRef.current?.image.uri,
        preservedCompletedImageRef.current ?? undefined,
        completedSnapshotClearRetentionRef.current?.imageUri,
      ]).catch(() => undefined);
      return;
    }
    void clearPersistedSession(requestId, completedSnapshotClearRetention);
  }, [clearPersistedSession]);

  const clearCompletion = useCallback(async (): Promise<boolean> => {
    const receipt = completionRef.current;
    if (!receipt) {
      return true;
    }
    const retainedSnapshot = completedSnapshotClearRetentionRef.current;
    const result = await removeCompletionDurably(
      retainedSnapshot
        ? async () => {
            const cleared = await clearPersistedSession(
              retainedSnapshot.requestId,
              retainedSnapshot,
            );
            return (
              cleared &&
              completedSnapshotClearRetentionRef.current !== retainedSnapshot
            );
          }
        : null,
      () => completionPersistence.clear(),
      () => completionRef.current === receipt,
    );
    if (result !== 'cleared') {
      if (mountedRef.current) {
        if (result === 'snapshot_failed') {
          setPersistenceError(
            'Last result could not be removed until saved progress is cleared',
          );
        } else if (result === 'receipt_failed') {
          setPersistenceError('Completed puzzle could not be removed');
        }
      }
      return false;
    }
    completionRef.current = null;
    durableCompletionRef.current = null;
    setCompletionSaving(false);
    setCompletionDurable(false);
    setCompletion(null);
    await reconcileOwnPhotoOwnership([
      sessionRef.current?.layout.image.uri,
      preservedCompletedImageRef.current ?? undefined,
      completedSnapshotClearRetentionRef.current?.imageUri,
    ]).catch(() => undefined);
    if (mountedRef.current) {
      setPersistenceError(null);
    }
    return true;
  }, [clearPersistedSession, completionPersistence]);

  useEffect(() => {
    const receipt = completionRef.current;
    const retention = completedSnapshotClearRetentionRef.current;
    if (
      session !== null ||
      !completionDurable ||
      !receipt ||
      durableCompletionRef.current !== receipt ||
      !retention ||
      retention.imageUri !== receipt.image.uri
    ) {
      return;
    }

    // A back gesture can leave Game while the completion receipt is still
    // saving. Once that receipt commits, remove the now-redundant active
    // snapshot through the same coordinated clear path.
    void clearPersistedSession(retention.requestId, retention);
  }, [clearPersistedSession, completionDurable, session]);

  return {
    session,
    completion,
    completionSaving,
    completionDurable,
    sessionAccessBlocked:
      !!session && isPremiumCutter(session.cutterId) && !isPremium,
    loading,
    restoring,
    error,
    persistenceError,
    startSession,
    beginSessionReplacement,
    commitSessionReplacement,
    rollbackSessionReplacement,
    resizeSession,
    updateGuideMode,
    setGameFocused,
    retrySave,
    clearSession,
    clearCompletion,
  };
}
