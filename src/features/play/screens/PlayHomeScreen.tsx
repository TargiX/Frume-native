import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import type { PlayStackParamList } from '../../../navigation/types';
import { isPremiumCutter, usePremiumAccess } from '../../../premium';
import { usePuzzleSessionContext } from '../../../puzzle/context';
import { usePuzzleEngine } from '../../../puzzle/hooks';
import { colors, spacing } from '../../../theme';
import { puzzleCutStyleLabel } from '../cutStylePresentation';
import { HomeBackdrop } from '../components/HomeBackdrop';
import { HomePhotoCard } from '../components/HomePhotoCard';
import {
  assetAspectRatio,
  HOME_FALLBACK_PHOTOS,
} from '../components/homePhotoSources';
import { PremiumCutsSheet } from '../components/PremiumCutsSheet';
import {
  createPlayHomeActionGuard,
  resolvePremiumResume,
} from './playHomeActionGuard';
import {
  NEW_PHOTO_REPLACEMENT_MESSAGE,
  NEW_PHOTO_REPLACEMENT_TITLE,
  requestNewPhotograph,
} from './playHomeNavigation';

type Props = NativeStackScreenProps<PlayStackParamList, 'PlayHome'>;

export function PlayHomeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const {
    session,
    completion,
    sessionAccessBlocked,
    restoring,
    persistenceError,
    clearCompletion,
  } = usePuzzleSessionContext();
  const {
    loading: premiumLoading,
    verifyPremiumCuts,
  } = usePremiumAccess();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const { state: engineState } = usePuzzleEngine(session?.engine ?? null);
  const actionGuardRef = useRef(
    createPlayHomeActionGuard(isFocused),
  );
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

  const restoringMessage = restoring ? 'Checking saved puzzle…' : null;
  useAccessibilityAnnouncement(isFocused ? restoringMessage : null);
  useAccessibilityAnnouncement(isFocused ? persistenceError : null);

  const completed = engineState?.status === 'completed';
  const placed = engineState
    ? Object.values(engineState.pieces).filter((piece) => piece.locked).length
    : 0;
  const total = engineState?.layout.pieces.length ?? 0;
  const savedPremiumCutLabel = session
    ? puzzleCutStyleLabel(session.cutterId)
    : 'Premium';

  const supersedePendingAction = () => {
    actionGuard.beginAction();
    checkingAccessRef.current = false;
    premiumResumeRef.current = null;
    setCheckingAccess(false);
    setShowPremium(false);
  };

  const navigateToGame = (targetSession: NonNullable<typeof session>) => {
    supersedePendingAction();
    navigation.navigate('Game', { difficulty: targetSession.difficulty });
  };

  const navigateToGallery = () => {
    supersedePendingAction();
    navigation.navigate('Gallery');
  };

  const chooseNewPhotograph = () => {
    requestNewPhotograph(Boolean(session), {
      confirmReplacement: (onConfirm) => {
        Alert.alert(
          NEW_PHOTO_REPLACEMENT_TITLE,
          NEW_PHOTO_REPLACEMENT_MESSAGE,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Choose new',
              style: 'destructive',
              onPress: onConfirm,
            },
          ],
        );
      },
      navigateToGallery,
    });
  };

  const navigateToAbout = () => {
    supersedePendingAction();
    navigation.navigate('AboutSupport');
  };

  const continuePuzzle = async () => {
    const requestedSession = session;
    if (!requestedSession || checkingAccessRef.current || !isFocused) {
      return;
    }

    const requestId = actionGuard.beginAction();
    premiumResumeRef.current = null;

    if (isPremiumCutter(requestedSession.cutterId)) {
      checkingAccessRef.current = true;
      setCheckingAccess(true);
      const resolution = await resolvePremiumResume(
        requestId,
        actionGuard,
        verifyPremiumCuts,
      );

      if (resolution === 'stale') {
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
      if (resolution === 'premium') {
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

  // Home is about one photograph: the print shows it sharp, the backdrop shows
  // the same frame out of focus. Before a first puzzle it stands in with a
  // bundled cover, chosen once per mount so it cannot swap while being read.
  const [fallbackIndex] = useState(() =>
    Math.floor(Math.random() * HOME_FALLBACK_PHOTOS.length),
  );
  const fallbackPhoto = HOME_FALLBACK_PHOTOS[fallbackIndex];
  const sessionImage = session?.layout.image ?? completion?.image;
  const heroSource = sessionImage
    ? { uri: sessionImage.uri }
    : fallbackPhoto;
  const heroAspectRatio =
    sessionImage && sessionImage.width > 0 && sessionImage.height > 0
      ? sessionImage.width / sessionImage.height
      : assetAspectRatio(fallbackPhoto);
  const completionCaption = completion
    ? `Last completed · ${completion.pieceCount} pieces · ${Math.floor(
        completion.elapsedMs / 60_000,
      )}:${Math.floor((completion.elapsedMs % 60_000) / 1_000)
        .toString()
        .padStart(2, '0')}`
    : undefined;
  const primaryLabel = checkingAccess
    ? 'Checking access…'
    : sessionAccessBlocked && !premiumLoading
      ? `Unlock to continue ${savedPremiumCutLabel}`
      : !session
        ? 'Choose a photograph'
        : completed
          ? 'Look at it again'
          : 'Continue';
  const openPrimary = session
    ? () => void continuePuzzle()
    : navigateToGallery;

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
          accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
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
                ? `${completed ? 'Completed puzzle' : 'Puzzle in progress'}, ${placed} of ${total} pieces placed`
                : completion
                  ? `${completionCaption} puzzle`
                : 'Choose a photograph to cut'
            }
            accessibilityHint={
              session
                ? 'Opens the table with this photograph'
                : completion
                  ? 'Opens the photograph themes to start another puzzle'
                : 'Opens the photograph themes'
            }
            disabled={checkingAccess}
            progress={
              session && !completed ? { placed, total } : undefined
            }
            caption={
              session
                ? undefined
                : completionCaption ??
                  'A photograph from the library, ready to cut'
            }
          />

          <View style={styles.actions}>
            <Button
              ref={premiumTriggerRef}
              label={primaryLabel}
              onPress={openPrimary}
              disabled={checkingAccess}
              block
            />
            {session ? (
              <View style={styles.centered}>
                <Button
                  label="New photograph"
                  variant="ghost"
                  onPress={chooseNewPhotograph}
                  disabled={checkingAccess}
                  accessibilityHint="Asks before replacing the saved puzzle and its progress"
                />
              </View>
            ) : completion ? (
              <View style={styles.centered}>
                <Button
                  label="Remove last result"
                  variant="ghost"
                  onPress={() => void clearCompletion()}
                  accessibilityHint="Removes the saved completion and releases its photograph"
                />
              </View>
            ) : null}
          </View>

          {sessionAccessBlocked && !premiumLoading ? (
            <Text style={styles.savedPremiumNotice}>
              Your {savedPremiumCutLabel} puzzle is still saved. Restore or
              unlock Premium Cuts to continue it.
            </Text>
          ) : null}
        </>
      )}

      {persistenceError ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
        >
          {persistenceError}
        </Text>
      ) : null}

      <View style={styles.centered}>
        <Button
          label="About & Support"
          variant="ghost"
          onPress={navigateToAbout}
          disabled={checkingAccess}
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
    alignItems: 'center',
    gap: spacing.xl,
  },
  centered: {
    alignSelf: 'center',
  },
  masthead: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    // Positive tracking: small caps-only type needs the air to stay legible,
    // and the spacing is what makes it read as a mark rather than a word.
    letterSpacing: 7,
    textAlign: 'center',
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  restoring: {
    alignSelf: 'stretch',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restoringText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
  },
  savedPremiumNotice: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
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
