import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { Button } from '../../../components/Button';
import { usePuzzleMusic } from '../../../audio';
import { GameHud } from '../components/GameHud';
import { PuzzleMenuSheet } from '../components/PuzzleMenuSheet';
import { PuzzleCelebration } from '../components/PuzzleCelebration';
import { usePuzzleSessionContext } from '../../../puzzle/context';
import { usePuzzleEngine } from '../../../puzzle/hooks';
import {
  PUZZLE_SURFACE_COLORS,
  PuzzleBoard,
  TableSurface,
} from '../../../puzzle/render';
import {
  DEFAULT_PUZZLE_TABLE_APPEARANCE,
  DEFAULT_PUZZLE_GUIDE_MODE,
  type PuzzleGuideMode,
  type PuzzleTableAppearance,
} from '../../../puzzle/types';
import type { PlayStackParamList } from '../../../navigation/types';
import { colors, radius, spacing } from '../../../theme';
import {
  enqueuePhotoUse,
  fetchPuzzlePhoto,
} from '../../../services/unsplash';
import {
  computeSafeAreaPlayLayout,
  TABLE_INSET,
} from '../utils/boardLayout';
import {
  loadTableAppearance,
  saveTableAppearance,
} from '../utils/tableAppearancePreference';
import {
  beginNextPuzzleRequest,
  buildNextPuzzleSessionParams,
  cancelNextPuzzleRequest,
  createNextPuzzleRequestState,
  finishNextPuzzleRequest,
  isNextPuzzleRequestCurrent,
  startTrackedNextPuzzle,
} from '../utils/nextPuzzle';

type Props = NativeStackScreenProps<PlayStackParamList, 'Game'>;

export function GameScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [guideMode, setGuideMode] = useState<PuzzleGuideMode>(
    DEFAULT_PUZZLE_GUIDE_MODE,
  );
  const [menuVisible, setMenuVisible] = useState(false);
  const [tableAppearance, setTableAppearance] =
    useState<PuzzleTableAppearance>(DEFAULT_PUZZLE_TABLE_APPEARANCE);
  const [assistFeedback, setAssistFeedback] = useState<string | null>(null);
  const [nextPuzzleLoading, setNextPuzzleLoading] = useState(false);
  const [nextPuzzleError, setNextPuzzleError] = useState<string | null>(null);
  const [retryingSave, setRetryingSave] = useState(false);
  const nextPuzzleRequestStateRef = useRef(createNextPuzzleRequestState());
  const {
    session,
    restoring,
    error,
    persistenceError,
    resizeSession,
    beginSessionReplacement,
    commitSessionReplacement,
    rollbackSessionReplacement,
    updateGuideMode,
    setGameFocused,
    retrySave,
    clearSession,
  } = usePuzzleSessionContext();
  const { engine, state } = usePuzzleEngine(session?.engine ?? null);
  const {
    musicEnabled,
    musicPreferenceLoaded,
    musicFeedback,
    setMusicEnabled,
    retryMusic,
  } = usePuzzleMusic(isFocused && Boolean(session));
  const isCompleted = state?.status === 'completed';
  const recoveryError =
    !restoring && (!session || !engine || !state)
      ? nextPuzzleError ?? error ?? persistenceError
      : null;
  useAccessibilityAnnouncement(isFocused ? recoveryError : null);
  const image = state?.layout.image ?? session?.layout.image;
  const attribution = image?.attribution;
  const currentBoardWidth = state?.layout.boardSize.width;
  const currentBoardHeight = state?.layout.boardSize.height;
  const imageAspect =
    image && image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3;
  const currentPieceCount = state?.layout.pieces.length ?? 0;
  const playLayout = useMemo(
    () =>
      computeSafeAreaPlayLayout(
        width,
        height,
        insets,
        imageAspect,
        currentPieceCount,
      ),
    [
      currentPieceCount,
      height,
      imageAspect,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      width,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      setGameFocused(true);
      return () => {
        cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
        setNextPuzzleLoading(false);
        setGameFocused(false);
      };
    }, [setGameFocused]),
  );

  useEffect(
    () => () => {
      cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
    },
    [],
  );

  useEffect(() => {
    setGuideMode(session?.guideMode ?? DEFAULT_PUZZLE_GUIDE_MODE);
  }, [session?.engine]);

  useEffect(() => {
    let current = true;
    void loadTableAppearance().then((appearance) => {
      if (current) {
        setTableAppearance(appearance);
      }
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!assistFeedback) {
      return;
    }
    const timer = setTimeout(() => setAssistFeedback(null), 1_800);
    return () => clearTimeout(timer);
  }, [assistFeedback]);

  useEffect(() => {
    if (
      !session ||
      currentBoardWidth === undefined ||
      currentBoardHeight === undefined
    ) {
      return;
    }
    if (
      Math.abs(currentBoardWidth - playLayout.boardWidth) < 0.5 &&
      Math.abs(currentBoardHeight - playLayout.boardHeight) < 0.5 &&
      (session.layout.trayPlacement ?? 'bottom') === playLayout.trayPlacement
    ) {
      return;
    }
    void resizeSession({
      boardMaxWidth: playLayout.boardWidth,
      boardMaxHeight: playLayout.boardHeight,
      trayPlacement: playLayout.trayPlacement,
    });
  }, [
    currentBoardHeight,
    currentBoardWidth,
    playLayout.boardHeight,
    playLayout.boardWidth,
    playLayout.trayPlacement,
    resizeSession,
    session?.engine,
  ]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
        // Completed progress is intentionally not resumable. Keep its image
        // only while the celebration/Play Again screen is actually visible.
        if (engine?.isComplete()) {
          clearSession();
        }
      }),
    [clearSession, engine, navigation],
  );

  const onPlayAgain = () => {
    cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
    setNextPuzzleLoading(false);
    setNextPuzzleError(null);
    engine?.reset();
  };

  const onNextPuzzle = async () => {
    const requestState = nextPuzzleRequestStateRef.current;
    if (requestState.current || !session) {
      return;
    }
    const request = beginNextPuzzleRequest(requestState);
    const isRequestCurrent = () =>
      isNextPuzzleRequestCurrent(requestState, request);
    setNextPuzzleLoading(true);
    setNextPuzzleError(null);
    try {
      const result = await fetchPuzzlePhoto(
        undefined,
        request.controller.signal,
        height >= width ? 'portrait' : 'landscape',
      );
      if (!isRequestCurrent()) {
        return;
      }
      if (!result) {
        setNextPuzzleError('No next photograph was available. Try again.');
        return;
      }
      const nextAspect = result.photo.width / result.photo.height;
      const nextLayout = computeSafeAreaPlayLayout(
        width,
        height,
        insets,
        nextAspect,
        currentPieceCount,
      );
      const startResult = await startTrackedNextPuzzle(
        buildNextPuzzleSessionParams(session, result, {
          boardMaxWidth: nextLayout.boardWidth,
          boardMaxHeight: nextLayout.boardHeight,
          trayPlacement: nextLayout.trayPlacement,
        }),
        {
          beginSessionReplacement: (params, transactionIsCurrent) =>
            beginSessionReplacement(
              params,
              session,
              transactionIsCurrent,
            ),
          enqueuePhotoUse: () =>
            enqueuePhotoUse(
              {
                links: {
                  download_location: result.photo.links.download_location,
                },
              },
              result.tracking_token,
            ),
          commitSessionReplacement,
          rollbackSessionReplacement,
        },
        isRequestCurrent,
      );
      if (!isRequestCurrent()) {
        return;
      }
      if (startResult === 'start_failed') {
        setNextPuzzleError('The next puzzle could not be prepared. Try again.');
      } else if (startResult === 'tracking_failed') {
        setNextPuzzleError(
          'This photo could not be prepared for play. Check your connection or device storage, then try again.',
        );
      }
    } catch {
      if (isRequestCurrent()) {
        setNextPuzzleError('The next puzzle could not be loaded. Try again.');
      }
    } finally {
      if (finishNextPuzzleRequest(requestState, request)) {
        setNextPuzzleLoading(false);
      }
    }
  };

  const onHome = () => {
    cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
    setNextPuzzleLoading(false);
    clearSession();
    navigation.popToTop();
  };

  const onExit = () => {
    cancelNextPuzzleRequest(nextPuzzleRequestStateRef.current);
    setMenuVisible(false);
    navigation.popToTop();
  };

  if (!session || !engine || !state) {
    return (
      <View style={styles.table}>
        <TableSurface width={width} height={height} />
        <ScrollView
          style={styles.recoveryScroll}
          contentContainerStyle={[
            styles.recoveryScrollContent,
            {
              paddingTop: insets.top + spacing.xl,
              paddingRight: insets.right + spacing.xl,
              paddingBottom: insets.bottom + spacing.xl,
              paddingLeft: insets.left + spacing.xl,
            },
          ]}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.recovery}>
            {restoring ? (
              <>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.recoveryText}>Restoring your puzzle…</Text>
              </>
            ) : (
              <>
                <Text style={styles.recoveryTitle}>Puzzle unavailable</Text>
                <Text
                  style={styles.recoveryText}
                  accessibilityLiveRegion={androidAccessibilityLiveRegion(
                    'assertive',
                  )}
                >
                  {nextPuzzleError ??
                    error ??
                    persistenceError ??
                    'Choose a photograph and try again.'}
                </Text>
                <Button
                  label="Choose another photo"
                  onPress={() => {
                    clearSession();
                    navigation.popToTop();
                    navigation.navigate('Gallery');
                  }}
                />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  const placedCount = Object.values(state.pieces).filter(
    (piece) => piece.locked,
  ).length;
  const elapsedMs = state.activeElapsedMs;
  const onRetryProgressSave = async () => {
    if (retryingSave) {
      return;
    }
    setRetryingSave(true);
    try {
      await retrySave();
    } finally {
      setRetryingSave(false);
    }
  };
  const onAssistPiece = () => {
    const result = engine.assistPiece();
    if (!result) {
      AccessibilityInfo.announceForAccessibilityWithOptions(
        'All puzzle pieces are already placed.',
        { queue: true },
      );
      return;
    }

    void Haptics.impactAsync(
      result.connectedWithNeighbor
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    const assistedDefinition = state.layout.pieces.find(
      (piece) => piece.id === result.pieceId,
    );
    const currentState = engine.getState();
    const assistedPlacedCount = Object.values(currentState.pieces).filter(
      (piece) => piece.locked,
    ).length;
    setAssistFeedback(
      `Piece ${(assistedDefinition?.index ?? 0) + 1} placed`,
    );
    AccessibilityInfo.announceForAccessibilityWithOptions(
      `Assist placed piece ${
        (assistedDefinition?.index ?? 0) + 1
      }. ${assistedPlacedCount} of ${state.layout.pieces.length} pieces placed.`,
      { queue: true },
    );
  };

  return (
    <View
      style={[
        styles.table,
        {
          paddingTop: insets.top + TABLE_INSET,
          paddingRight: insets.right + TABLE_INSET,
          paddingBottom: insets.bottom + TABLE_INSET,
          paddingLeft: insets.left + TABLE_INSET,
        },
      ]}
    >
      <TableSurface
        width={width}
        height={height}
        appearance={tableAppearance}
        imageUri={image?.uri}
      />
      {!isCompleted && !menuVisible ? (
        <View style={styles.hudLayer} pointerEvents="box-none">
          <GameHud
            placedCount={placedCount}
            totalCount={state.layout.pieces.length}
            activeElapsedMs={state.activeElapsedMs}
            activeStartedAt={state.activeStartedAt}
            onOpenMenu={() => setMenuVisible(true)}
          />
        </View>
      ) : null}
      <View
        style={styles.boardFrame}
        accessibilityElementsHidden={isCompleted}
        importantForAccessibility={
          isCompleted ? 'no-hide-descendants' : 'auto'
        }
      >
        <PuzzleBoard
          layout={state.layout}
          pieces={state.pieces}
          engine={engine}
          viewportWidth={
            width - insets.left - insets.right - TABLE_INSET * 2
          }
          viewportHeight={
            height - insets.top - insets.bottom - TABLE_INSET * 2
          }
          snapFeedback={state.snapFeedback}
          completed={isCompleted}
          guideMode={guideMode}
          tableAppearance={tableAppearance}
        />
      </View>
      {isCompleted ? (
        <PuzzleCelebration
          elapsedMs={elapsedMs}
          nextLoading={nextPuzzleLoading}
          nextError={nextPuzzleError}
          onNext={() => void onNextPuzzle()}
          onPlayAgain={onPlayAgain}
          onHome={onHome}
        />
      ) : null}
      {!isCompleted ? (
        <PuzzleMenuSheet
          visible={menuVisible}
          placedCount={placedCount}
          totalCount={state.layout.pieces.length}
          cutterId={session.cutterId}
          guideMode={guideMode}
          tableAppearance={tableAppearance}
          musicEnabled={musicEnabled}
          musicPreferenceLoaded={musicPreferenceLoaded}
          musicFeedback={musicFeedback}
          persistenceError={persistenceError}
          retryingSave={retryingSave}
          attribution={attribution}
          onClose={() => setMenuVisible(false)}
          onSelectGuide={(mode) => {
            setGuideMode(mode);
            updateGuideMode(mode);
            setMenuVisible(false);
          }}
          onSelectTableAppearance={(appearance) => {
            setTableAppearance(appearance);
            void saveTableAppearance(appearance);
          }}
          onSetMusicEnabled={setMusicEnabled}
          onRetryMusic={retryMusic}
          onRetrySave={() => void onRetryProgressSave()}
          onAssistPiece={() => {
            setMenuVisible(false);
            requestAnimationFrame(onAssistPiece);
          }}
          onReturnLoosePieces={() => {
            engine.returnAllLoosePiecesToTray();
            setMenuVisible(false);
          }}
          onExit={onExit}
        />
      ) : null}
      {assistFeedback && !isCompleted ? (
        <View
          style={[
            styles.feedback,
            { bottom: insets.bottom + spacing.xl },
          ]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.feedbackText}>{assistFeedback}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
    backgroundColor: PUZZLE_SURFACE_COLORS.tableBase,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boardFrame: {
    borderRadius: 4,
    overflow: 'visible',
    // The board carries its own depth now that a zoomed board fills the whole
    // table: a shadow on this frame would outline the empty table around it.
    elevation: 0,
  },
  hudLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  feedback: {
    position: 'absolute',
    alignSelf: 'center',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18, 15, 12, 0.92)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  feedbackText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  recovery: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.lg,
  },
  recoveryScroll: {
    flex: 1,
    width: '100%',
  },
  recoveryScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    textAlign: 'center',
  },
  recoveryText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
