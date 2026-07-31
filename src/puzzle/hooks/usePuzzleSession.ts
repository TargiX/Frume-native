import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isPremiumCutter, usePremiumAccess } from '../../premium';
import { getCutter } from '../cutters';
import { PuzzleEngine } from '../engine';
import { DEFAULT_PUZZLE_GUIDE_MODE } from '../types';
import {
  ExpoPuzzleImageFileStore,
  PuzzleImageCache,
  PuzzleSessionPersistence,
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
  readonly previousSession: PuzzleSession;
  readonly nextSession: PuzzleSession;
  readonly requestId: number;
  readonly previousImageDurable: boolean;
  settled: boolean;
};

export type UsePuzzleSessionResult = {
  session: PuzzleSession | null;
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
   * Installs a guarded replacement without pruning the previous image. The
   * caller must commit only after its required provider-use record succeeds,
   * or roll back this exact transaction.
   */
  beginSessionReplacement: (
    params: StartPuzzleSessionParams,
    expectedSession: PuzzleSession,
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
    trayPlacement: PuzzleTrayPlacement;
  }) => Promise<void>;
  /** Updates and durably schedules the board-help choice for this puzzle. */
  updateGuideMode: (mode: PuzzleGuideMode) => void;
  /** Keeps active-time accounting scoped to the visible Game screen. */
  setGameFocused: (focused: boolean) => void;
  /** Attempts to durably flush the exact active session again. */
  retrySave: () => Promise<boolean>;
  clearSession: () => void;
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
    await imageCache.retainOnly(imageUri);
  }
  return { current: isCurrent(), saved };
}

export function isPuzzleSessionReplacementCurrent(
  replacement: PuzzleSessionReplacement,
  currentSession: PuzzleSession | null,
  currentRequestId: number,
): boolean {
  return (
    !replacement.settled &&
    replacement.requestId === currentRequestId &&
    currentSession?.engine === replacement.nextSession.engine
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

export function usePuzzleSession(): UsePuzzleSessionResult {
  const { isPremium, verifyPremiumCuts } = usePremiumAccess();
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const sessionRef = useRef<PuzzleSession | null>(null);
  const unsubscribeEngineRef = useRef<(() => void) | null>(null);
  const resizeRequestId = useRef(0);
  const sessionRequestId = useRef(0);
  const mountedRef = useRef(true);
  const imageDurableRef = useRef(true);
  const gameFocusedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const persistenceRef = useRef<PuzzleSessionPersistence | null>(null);
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
            // A completed puzzle no longer needs a relaunch save. Its image
            // remains only while this in-memory session is visible/eligible
            // for Play Again, and is pruned on clear or next cold launch.
            void persistence.clear();
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
    [persistence],
  );

  useEffect(() => {
    let cancelled = false;
    const requestId = ++sessionRequestId.current;

    void loadPuzzleSessionForRestore(
      persistence,
      imageCache,
      () => !cancelled && requestId === sessionRequestId.current,
    )
      .then(async (loadResult) => {
        if (cancelled || requestId !== sessionRequestId.current) {
          return;
        }
        if (loadResult.status === 'error') {
          setPersistenceError('Saved puzzle could not be restored');
          return;
        }
        if (loadResult.status === 'empty') {
          imageDurableRef.current = true;
          return;
        }
        const restored = loadResult.session;
        if (restored.engine.status === 'completed') {
          imageDurableRef.current = true;
          await imageCache
            .clearAfter(persistence.clear())
            .catch(() => undefined);
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
  }, [imageCache, installSession, persistence]);

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

  const startSession = useCallback(
    async ({
      image,
      cutterId = 'classic',
      difficulty,
      guideMode = DEFAULT_PUZZLE_GUIDE_MODE,
      boardMaxWidth,
      boardMaxHeight,
      trayPlacement = 'bottom',
    }: StartPuzzleSessionParams): Promise<boolean> => {
      const requestId = ++sessionRequestId.current;
      resizeRequestId.current += 1;
      setLoading(true);
      setRestoring(false);
      setError(null);
      try {
        const premiumCutsUnlocked = isPremiumCutter(cutterId)
          ? await verifyPremiumCuts()
          : false;
        if (requestId !== sessionRequestId.current) {
          return false;
        }
        const result = await preparePuzzleSession(
          {
            image,
            cutterId,
            difficulty,
            guideMode,
            boardMaxWidth,
            boardMaxHeight,
            trayPlacement,
          },
          getCutter,
          premiumCutsUnlocked,
        );
        if (requestId !== sessionRequestId.current) {
          return false;
        }
        if (!result.success) {
          setError(result.error);
          return false;
        }
        let cachedImage = { image, durable: false };
        try {
          cachedImage = await imageCache.cacheForReplacement(
            image,
            sessionRef.current?.layout.image.uri,
          );
        } catch {
          // Continue with the remote image; the warning below is non-fatal.
        }
        if (requestId !== sessionRequestId.current) {
          return false;
        }
        const nextSession = replaceSessionImage(
          result.session,
          cachedImage.image,
        );
        imageDurableRef.current = cachedImage.durable;
        installSession(nextSession);
        const completion = await finalizePuzzleSessionStart(
          nextSession.layout.image.uri,
          persistence,
          imageCache,
          () =>
            requestId === sessionRequestId.current &&
            sessionRef.current?.engine === nextSession.engine,
        );
        if (!completion.current) {
          return false;
        }
        const { saved } = completion;
        if (!cachedImage.durable && mountedRef.current) {
          setPersistenceError(
            'Photo could not be cached for offline play; progress still saves',
          );
        } else if (!saved && mountedRef.current) {
          setPersistenceError('Progress could not be saved on this device');
        }
        return true;
      } catch (caught) {
        if (requestId === sessionRequestId.current) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Failed to create puzzle',
          );
        }
        return false;
      } finally {
        if (requestId === sessionRequestId.current) {
          setLoading(false);
        }
      }
    },
    [imageCache, installSession, persistence, verifyPremiumCuts],
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
        trayPlacement = 'bottom',
      }: StartPuzzleSessionParams,
      expectedSession: PuzzleSession,
      isRequestCurrent: () => boolean,
    ): Promise<PuzzleSessionReplacement | null> => {
      const requestId = ++sessionRequestId.current;
      resizeRequestId.current += 1;
      const previousImageDurable = imageDurableRef.current;
      const stillOwnsReplacement = () =>
        requestId === sessionRequestId.current &&
        sessionRef.current?.engine === expectedSession.engine &&
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
            expectedSession.layout.image.uri,
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
        imageDurableRef.current = cachedImage.durable;
        installSession(nextSession);
        return {
          previousSession: expectedSession,
          nextSession,
          requestId,
          previousImageDurable,
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
    [imageCache, installSession, verifyPremiumCuts],
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

      // The previous image deliberately remains in the second fixed cache
      // slot until a future replacement overwrites it. That keeps rollback
      // exact even if cancellation races this durable-state flush.
      const saved = await persistence.flush();
      if (!isCurrent()) {
        return false;
      }

      replacement.settled = true;
      if (!imageDurableRef.current && mountedRef.current) {
        setPersistenceError(
          'Photo could not be cached for offline play; progress still saves',
        );
      } else if (!saved && mountedRef.current) {
        setPersistenceError('Progress could not be saved on this device');
      } else if (mountedRef.current) {
        setPersistenceError(null);
      }
      return true;
    },
    [persistence],
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

      replacement.settled = true;
      const rollbackRequestId = ++sessionRequestId.current;
      resizeRequestId.current += 1;
      unsubscribeEngineRef.current?.();
      unsubscribeEngineRef.current = null;

      // clear() cancels debounced work and is sequenced after any write already
      // in flight. Reinstall only after that queue cannot resurrect the new
      // session, and only if Home/newer work did not supersede this rollback.
      const cleared = await persistence.clear();
      if (
        rollbackRequestId !== sessionRequestId.current ||
        sessionRef.current?.engine !== replacement.nextSession.engine
      ) {
        return false;
      }

      await imageCache
        .retainOnly(replacement.previousSession.layout.image.uri)
        .catch(() => undefined);
      if (
        rollbackRequestId !== sessionRequestId.current ||
        sessionRef.current?.engine !== replacement.nextSession.engine
      ) {
        return false;
      }

      imageDurableRef.current = replacement.previousImageDurable;
      installSession(replacement.previousSession);
      setLoading(false);
      setError(null);
      if (!cleared && mountedRef.current) {
        setPersistenceError('Progress could not be saved on this device');
      }
      return true;
    },
    [imageCache, installSession, persistence],
  );

  const resizeSession = useCallback(
    async ({
      boardMaxWidth,
      boardMaxHeight,
      trayPlacement,
    }: {
      boardMaxWidth: number;
      boardMaxHeight: number;
      trayPlacement: PuzzleTrayPlacement;
    }) => {
      const current = sessionRef.current;
      if (!current) {
        return;
      }
      if (
        Math.abs(current.layout.boardSize.width - boardMaxWidth) < 0.5 &&
        Math.abs(current.layout.boardSize.height - boardMaxHeight) < 0.5 &&
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
    if (!imageDurableRef.current) {
      setPersistenceError(
        'Photo could not be cached for offline play; progress still saves',
      );
      return true;
    }
    setPersistenceError(null);
    return true;
  }, [persistence]);

  const clearSession = useCallback(() => {
    const requestId = ++sessionRequestId.current;
    resizeRequestId.current += 1;
    unsubscribeEngineRef.current?.();
    unsubscribeEngineRef.current = null;
    sessionRef.current = null;
    imageDurableRef.current = true;
    setSession(null);
    setLoading(false);
    setRestoring(false);
    setError(null);
    void imageCache
      .clearAfter(persistence.clear())
      .then((cleared) => {
        if (
          cleared &&
          requestId === sessionRequestId.current &&
          mountedRef.current
        ) {
          setPersistenceError(null);
        }
      })
      .catch(() => undefined);
  }, [imageCache, persistence]);

  return {
    session,
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
  };
}
