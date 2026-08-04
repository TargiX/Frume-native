import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

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
import { PremiumCutsSheet } from '../components/PremiumCutsSheet';
import {
  createPlayHomeActionGuard,
  resolvePremiumResume,
} from './playHomeActionGuard';

type Props = NativeStackScreenProps<PlayStackParamList, 'PlayHome'>;

export function PlayHomeScreen({ navigation }: Props) {
  const isFocused = useIsFocused();
  const {
    session,
    sessionAccessBlocked,
    restoring,
    persistenceError,
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
  const savedPremiumCutLabel =
    session?.cutterId === 'biomorphic'
      ? 'Living'
      : session?.cutterId === 'amoeba'
        ? 'Amoeba'
        : 'Organic';

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

  return (
    <Screen centered scroll safeTop style={styles.content}>
      <Image
        source={require('../../../../assets/frume-adaptive-foreground.png')}
        style={styles.mark}
        resizeMode="contain"
        accessible={false}
      />
      <Text style={styles.eyebrow}>Frume</Text>
      <Text
        style={styles.title}
        accessibilityRole="header"
        maxFontSizeMultiplier={2}
      >
        Photographs, cut differently
      </Text>
      <Text style={styles.subtitle}>
        Choose a photograph, settle into the table, and take your time.
      </Text>
      <Text style={styles.accessNote}>
        Classic cuts are free. Organic and Living cuts share one permanent
        premium unlock.
      </Text>

      {restoring ? (
        <View
          style={styles.restoring}
          accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.restoringText}>{restoringMessage}</Text>
        </View>
      ) : session ? (
        <View style={styles.actions}>
          <Button
            label={
              checkingAccess
                ? 'Checking access…'
                : sessionAccessBlocked && !premiumLoading
                  ? `Unlock to continue ${savedPremiumCutLabel} puzzle`
                  : completed
                    ? 'View completed puzzle'
                    : `Continue · ${placed} of ${total}`
            }
            onPress={() => void continuePuzzle()}
            disabled={checkingAccess}
            block
          />
          {sessionAccessBlocked && !premiumLoading ? (
            <Text style={styles.savedPremiumNotice}>
              Your {savedPremiumCutLabel} puzzle is still saved. Restore or
              unlock Premium Cuts to continue it.
            </Text>
          ) : null}
          <Button
            label="New puzzle"
            variant="secondary"
            onPress={navigateToGallery}
            disabled={checkingAccess}
            block
          />
        </View>
      ) : (
        <Button
          label="Choose a puzzle"
          onPress={navigateToGallery}
          disabled={checkingAccess}
        />
      )}

      {persistenceError ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
        >
          {persistenceError}
        </Text>
      ) : null}

      <Button
        label="About & Support"
        variant="ghost"
        onPress={navigateToAbout}
        disabled={checkingAccess}
        accessibilityHint="Opens privacy, support, purchase restore, and app version information"
        style={styles.aboutButton}
      />
      <PremiumCutsSheet
        visible={showPremium}
        onClose={closePremium}
        onUnlocked={continueAfterUnlock}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'flex-start',
  },
  mark: {
    width: 78,
    height: 78,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -0.7,
    marginBottom: spacing.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: spacing.lg,
  },
  accessNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.xl,
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
    gap: spacing.md,
  },
  savedPremiumNotice: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.lg,
  },
  aboutButton: {
    marginTop: spacing.xl,
    paddingHorizontal: 0,
  },
});
