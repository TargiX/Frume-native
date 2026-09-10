import { useIsFocused } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from "../../../accessibility";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DISCOVERY_IMAGE,
  DISCOVERY_DIFFICULTY,
  isDiscoveryPuzzle,
} from "../../../puzzle/discovery";
import {
  DISCOVERY_ASSET,
  displayImageUri,
} from "../../../puzzle/discoveryAsset";
import { computeSafeAreaPlayLayout } from "../utils/boardLayout";
import { puzzleLibrary } from "../../../puzzle/persistence/PuzzleLibrary";
import { track } from "../../../analytics";
import { Button } from "../../../components/Button";
import { Screen } from "../../../components/Screen";
import type { PlayStackParamList } from "../../../navigation/types";
import { isPremiumCutter, usePremiumAccess } from "../../../premium";
import { usePuzzleSessionContext } from "../../../puzzle/context";
import { usePuzzleEngine } from "../../../puzzle/hooks";
import { colors, spacing } from "../../../theme";
import { puzzleCutStyleLabel } from "../cutStylePresentation";
import { HomeBackdrop } from "../components/HomeBackdrop";
import { HomePhotoCard } from "../components/HomePhotoCard";
import { PremiumCutsSheet } from "../components/PremiumCutsSheet";
import {
  createPlayHomeActionGuard,
  resolvePremiumResume,
} from "./playHomeActionGuard";

type Props = NativeStackScreenProps<PlayStackParamList, "PlayHome">;

export function PlayHomeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const discoveryStartingRef = useRef(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const {
    session,
    completion,
    sessionAccessBlocked,
    restoring,
    persistenceError,
    startSession,
    openLibraryPuzzle,
    loading,
    error,
  } = usePuzzleSessionContext();
  const { loading: premiumLoading, verifyPremiumCuts } = usePremiumAccess();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const { state: engineState } = usePuzzleEngine(session?.engine ?? null);
  const actionGuardRef = useRef(createPlayHomeActionGuard(isFocused));
  const actionGuard = actionGuardRef.current;
  const checkingAccessRef = useRef(false);
  const premiumTriggerRef = useRef<React.ElementRef<typeof Pressable> | null>(
    null,
  );
  const sessionRef = useRef(session);
  const premiumResumeRef = useRef<{
    requestId: number;
    session: NonNullable<typeof session>;
  } | null>(null);
  sessionRef.current = session;
  actionGuard.setFocused(isFocused);

  useEffect(() => {
    if (!isFocused) {
      checkingAccessRef.current = false;
      premiumResumeRef.current = null;
      setCheckingAccess(false);
      setShowPremium(false);
    }
  }, [isFocused]);

  useEffect(
    () => () => {
      actionGuard.invalidate();
      checkingAccessRef.current = false;
      premiumResumeRef.current = null;
    },
    [actionGuard],
  );

  const restoringMessage = restoring ? "Checking saved puzzle…" : null;
  useAccessibilityAnnouncement(isFocused ? restoringMessage : null);
  useAccessibilityAnnouncement(isFocused ? persistenceError : null);

  const completed = engineState?.status === "completed";
  const placed = engineState
    ? Object.values(engineState.pieces).filter((piece) => piece.locked).length
    : 0;
  const total = engineState?.layout.pieces.length ?? 0;
  const savedPremiumCutLabel = session
    ? puzzleCutStyleLabel(session.cutterId)
    : "Premium";

  const supersedePendingAction = () => {
    actionGuard.beginAction();
    checkingAccessRef.current = false;
    premiumResumeRef.current = null;
    setCheckingAccess(false);
    setShowPremium(false);
  };

  const navigateToGame = (targetSession: NonNullable<typeof session>) => {
    supersedePendingAction();
    navigation.navigate("Game", { difficulty: targetSession.difficulty });
  };

  const navigateToGallery = () => {
    supersedePendingAction();
    navigation.navigate("Gallery");
  };

  const chooseNewPhotograph = navigateToGallery;
  const startDiscovery = async () => {
    if (discoveryStartingRef.current || loading || restoring) return;
    if (
      session &&
      isDiscoveryPuzzle(
        session.layout.image,
        session.cutterId,
        session.difficulty,
      )
    ) {
      navigateToGame(session);
      return;
    }
    discoveryStartingRef.current = true;
    setDiscoveryError(null);
    const requestId = actionGuard.beginAction();
    const layout = computeSafeAreaPlayLayout(width, height, insets, 2 / 3, 16);
    try {
      const waiting = (await puzzleLibrary.load()).find(
        (entry) =>
          entry.snapshot.engine.status !== "completed" &&
          isDiscoveryPuzzle(
            entry.snapshot.engine.layout.image,
            entry.snapshot.cutterId,
            entry.snapshot.difficulty,
          ),
      );
      if (!actionGuard.isCurrent(requestId)) return;
      if (waiting) {
        const resumed = await openLibraryPuzzle(waiting.id);
        if (resumed && actionGuard.isCurrent(requestId))
          navigateToGame(resumed);
        return;
      }
      const started = await startSession({
        image: DISCOVERY_IMAGE,
        cutterId: "organic",
        difficulty: DISCOVERY_DIFFICULTY,
        guideMode: "image",
        boardMaxWidth: layout.boardWidth,
        boardMaxHeight: layout.boardHeight,
        traySurfaceExtent: layout.trayRunExtent,
        trayPlacement: layout.trayPlacement,
      });
      if (started && actionGuard.isCurrent(requestId)) {
        track("puzzle_started", {
          cut_id: "organic",
          piece_count: 16,
          source: "discovery",
        });
        navigation.navigate("Game", { difficulty: DISCOVERY_DIFFICULTY });
      }
    } catch {
      setDiscoveryError(
        "The sample could not be opened. Your saved puzzles have been kept.",
      );
    } finally {
      discoveryStartingRef.current = false;
    }
  };

  const navigateToAbout = () => {
    supersedePendingAction();
    navigation.navigate("AboutSupport");
  };

  const continuePuzzle = async () => {
    const requestedSession = session;
    if (!requestedSession || checkingAccessRef.current || !isFocused) {
      return;
    }

    const requestId = actionGuard.beginAction();
    premiumResumeRef.current = null;

    if (
      isPremiumCutter(requestedSession.cutterId) &&
      !isDiscoveryPuzzle(
        requestedSession.layout.image,
        requestedSession.cutterId,
        requestedSession.difficulty,
      )
    ) {
      checkingAccessRef.current = true;
      setCheckingAccess(true);
      const resolution = await resolvePremiumResume(
        requestId,
        actionGuard,
        verifyPremiumCuts,
      );

      if (resolution === "stale") {
        return;
      }

      if (sessionRef.current !== requestedSession) {
        actionGuard.invalidate();
        checkingAccessRef.current = false;
        setCheckingAccess(false);
        return;
      }

      checkingAccessRef.current = false;
      setCheckingAccess(false);
      if (resolution === "premium") {
        premiumResumeRef.current = { requestId, session: requestedSession };
        setShowPremium(true);
        return;
      }
    }

    if (
      actionGuard.isCurrent(requestId) &&
      sessionRef.current === requestedSession
    ) {
      navigateToGame(requestedSession);
    }
  };

  const closePremium = () => {
    supersedePendingAction();
  };

  const continueAfterUnlock = () => {
    const pendingResume = premiumResumeRef.current;
    if (
      !pendingResume ||
      !actionGuard.isCurrent(pendingResume.requestId) ||
      sessionRef.current !== pendingResume.session
    ) {
      supersedePendingAction();
      return;
    }

    navigateToGame(pendingResume.session);
  };

  const sessionImage = session?.layout.image ?? completion?.image;
  const heroSource = sessionImage
    ? { uri: displayImageUri(sessionImage.uri) }
    : DISCOVERY_ASSET;
  const heroAspectRatio =
    sessionImage && sessionImage.width > 0 && sessionImage.height > 0
      ? sessionImage.width / sessionImage.height
      : 2 / 3;
  const completionCaption = completion
    ? `Last completed · ${completion.pieceCount} pieces · ${Math.floor(
        completion.elapsedMs / 60_000,
      )}:${Math.floor((completion.elapsedMs % 60_000) / 1_000)
        .toString()
        .padStart(2, "0")}`
    : undefined;
  const primaryLabel = checkingAccess
    ? "Checking access…"
    : sessionAccessBlocked && !premiumLoading
      ? `Unlock to continue ${savedPremiumCutLabel}`
      : !session
        ? completion
          ? "Your album"
          : "Try a quiet puzzle"
        : completed
          ? "Look at it again"
          : "Continue";
  const openPrimary = session
    ? () => void continuePuzzle()
    : completion
      ? () => navigation.navigate("Library")
      : () => void startDiscovery();

  return (
    <Screen
      centered
      scroll
      safeTop
      style={styles.content}
      background={<HomeBackdrop source={heroSource} />}
    >
      <View style={styles.masthead}>
        <Text style={styles.wordmark} accessibilityRole="header">
          FRUME
        </Text>
        <Text style={styles.tagline}>Photographs, cut differently</Text>
      </View>

      {restoring ? (
        <View
          style={styles.restoring}
          accessibilityLiveRegion={androidAccessibilityLiveRegion("polite")}
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.restoringText}>{restoringMessage}</Text>
        </View>
      ) : (
        <>
          <HomePhotoCard
            source={heroSource}
            aspectRatio={heroAspectRatio}
            onPress={openPrimary}
            accessibilityLabel={
              session
                ? `${completed ? "Completed puzzle" : "Puzzle in progress"}, ${placed} of ${total} pieces placed`
                : completion
                  ? `${completionCaption} puzzle`
                  : "Try Coastal morning, a free 16-piece Organic puzzle"
            }
            accessibilityHint={
              session
                ? "Opens the table with this photograph"
                : completion
                  ? "Opens your album of completed photographs"
                  : "Starts the free Organic sample"
            }
            disabled={checkingAccess || loading}
            progress={session && !completed ? { placed, total } : undefined}
            caption={
              session
                ? undefined
                : (completionCaption ??
                  "Coastal morning · 16 flowing pieces · Free sample")
            }
          />

          <View style={styles.actions}>
            <Button
              ref={premiumTriggerRef}
              label={primaryLabel}
              onPress={openPrimary}
              disabled={checkingAccess || loading}
              block
            />
            {session ? (
              <View style={styles.centered}>
                <Button
                  label="New photograph"
                  variant="ghost"
                  onPress={chooseNewPhotograph}
                  disabled={checkingAccess || loading}
                  accessibilityHint="Choose another photograph; this puzzle will wait on your shelf"
                />
              </View>
            ) : null}
          </View>

          {!session ? (
            <Button
              label="Choose a photograph"
              variant="ghost"
              onPress={navigateToGallery}
              disabled={loading}
            />
          ) : null}
          <Button
            label="Shelf & album"
            variant="secondary"
            onPress={() => navigation.navigate("Library")}
            disabled={loading}
          />
          {session ? (
            <Button
              label="Try the free Organic sample"
              variant="ghost"
              onPress={() => void startDiscovery()}
              disabled={loading}
            />
          ) : (
            <Text style={styles.savedPremiumNotice}>
              A Frume study. No account, no timer to beat. Your photographs stay
              yours.
            </Text>
          )}
          {sessionAccessBlocked && !premiumLoading ? (
            <Text style={styles.savedPremiumNotice}>
              Your {savedPremiumCutLabel} puzzle is still saved. Restore or
              unlock Premium Cuts to continue it.
            </Text>
          ) : null}
        </>
      )}

      {persistenceError || error || discoveryError ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion={androidAccessibilityLiveRegion("polite")}
        >
          {persistenceError ?? error ?? discoveryError}
        </Text>
      ) : null}

      <View style={styles.centered}>
        <Button
          label="About & Support"
          variant="ghost"
          onPress={navigateToAbout}
          disabled={checkingAccess || loading}
          accessibilityHint="Opens privacy, support, purchase restore, and app version information"
          style={styles.aboutButton}
        />
      </View>
      <PremiumCutsSheet
        visible={showPremium}
        onClose={closePremium}
        onUnlocked={continueAfterUnlock}
        returnFocusRef={premiumTriggerRef}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    gap: spacing.xl,
  },
  centered: {
    alignSelf: "center",
  },
  masthead: {
    alignItems: "center",
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    // Positive tracking: small caps-only type needs the air to stay legible,
    // and the spacing is what makes it read as a mark rather than a word.
    letterSpacing: 7,
    textAlign: "center",
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  restoring: {
    alignSelf: "stretch",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  restoringText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm,
  },
  savedPremiumNotice: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.lg,
  },
  aboutButton: {
    paddingHorizontal: 0,
  },
});
