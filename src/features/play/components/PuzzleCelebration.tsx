import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccessibilityAnnouncement } from '../../../accessibility';
import { Button } from '../../../components/Button';
import { colors, radius, spacing } from '../../../theme';
import {
  CELEBRATION_MOTION,
  CONFETTI_PARTICLES,
} from './celebrationPresentation';

type PuzzleCelebrationProps = {
  elapsedMs: number;
  nextLoading?: boolean;
  nextError?: string | null;
  onNext: () => void;
  onPlayAgain: () => void;
  onHome: () => void;
};

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * The finished photograph is the reward, so the completion chrome docks at the
 * bottom edge instead of covering it, and a tap anywhere clears even that. No
 * timed pause gates any of it: how long to look is the player's to decide.
 */
export function PuzzleCelebration({
  elapsedMs,
  nextLoading = false,
  nextError,
  onNext,
  onPlayAgain,
  onHome,
}: PuzzleCelebrationProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [panelVisible, setPanelVisible] = useState(true);
  useAccessibilityAnnouncement(nextError ?? null);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(
      `Puzzle complete in ${formatElapsed(elapsedMs)}`,
    );
  }, [elapsedMs, reduceMotion]);

  // Only the first appearance waits for the reveal; a panel the player asked
  // back should come straight away.
  const [firstAppearance, setFirstAppearance] = useState(true);
  const panelEntering = reduceMotion
    ? FadeIn.duration(CELEBRATION_MOTION.reducedDurationMs)
    : SlideInDown
        .delay(firstAppearance ? CELEBRATION_MOTION.panelDelayMs : 0)
        .duration(CELEBRATION_MOTION.panelDurationMs)
        .easing(Easing.out(Easing.cubic));
  const panelExiting = reduceMotion
    ? FadeOut.duration(CELEBRATION_MOTION.reducedDurationMs)
    : SlideOutDown.duration(CELEBRATION_MOTION.panelDurationMs);
  const particleAnimations = useMemo(
    () =>
      CONFETTI_PARTICLES.map(
        (particle) =>
          new Keyframe({
            0: {
              opacity: 0,
              transform: [
                { translateX: 0 },
                { translateY: 0 },
                { rotate: '0deg' },
                { scale: 0.4 },
              ],
            },
            18: {
              opacity: 1,
              transform: [
                { translateX: particle.driftX * 0.35 },
                { translateY: -28 },
                { rotate: `${particle.rotation * 0.25}deg` },
                { scale: 1 },
              ],
            },
            72: {
              opacity: 1,
              transform: [
                { translateX: particle.driftX * 0.8 },
                { translateY: particle.fallY * 0.45 },
                { rotate: `${particle.rotation * 0.7}deg` },
                { scale: 1 },
              ],
            },
            100: {
              opacity: 0,
              transform: [
                { translateX: particle.driftX },
                { translateY: particle.fallY },
                { rotate: `${particle.rotation}deg` },
                { scale: 0.85 },
              ],
            },
          })
            .delay(particle.delay)
            .duration(CELEBRATION_MOTION.confettiDurationMs),
      ),
    [],
  );

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      accessibilityViewIsModal
    >
      {!reduceMotion ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI_PARTICLES.map((particle, index) => (
            <Animated.View
              key={`${particle.left}-${particle.top}-${index}`}
              entering={particleAnimations[index]}
              style={[
                styles.confetti,
                {
                  left: particle.left,
                  top: particle.top,
                  width: particle.width,
                  height: particle.height,
                  backgroundColor: particle.color,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={
          panelVisible
            ? 'Hide the completion panel'
            : 'Show the completion panel'
        }
        accessibilityHint="The finished photograph stays on screen either way"
        onPress={() => {
          setFirstAppearance(false);
          setPanelVisible((visible) => !visible);
        }}
      />

      {panelVisible ? (
        <Animated.View
          entering={panelEntering}
          exiting={panelExiting}
          style={[
            styles.panel,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              paddingLeft: Math.max(insets.left, spacing.lg),
              paddingRight: Math.max(insets.right, spacing.lg),
            },
          ]}
        >
          <View style={styles.summary}>
            <View
              style={styles.badge}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="sparkles" size={16} color={colors.onAccent} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Puzzle complete
            </Text>
            <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
          </View>

          {nextError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {nextError}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.primarySlot}>
              <Button
                label={nextLoading ? 'Finding next puzzle…' : 'Next puzzle'}
                onPress={onNext}
                disabled={nextLoading}
                block
              />
            </View>
            <View style={styles.actionSlot}>
              <Button
                label="Play again"
                variant="secondary"
                onPress={onPlayAgain}
                block
              />
            </View>
            <View style={styles.actionSlot}>
              <Button label="Home" variant="secondary" onPress={onHome} block />
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // No scrim: nothing dims the photograph the player just finished.
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  panel: {
    paddingTop: spacing.md,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(24, 21, 18, 0.92)',
    borderTopWidth: 1,
    borderColor: 'rgba(228, 170, 71, 0.32)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.34,
    shadowRadius: 20,
    elevation: 16,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  elapsed: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primarySlot: {
    minWidth: 168,
    flexGrow: 2,
    flexBasis: 168,
  },
  actionSlot: {
    minWidth: 120,
    flexGrow: 1,
    flexBasis: 120,
  },
  confetti: {
    position: 'absolute',
    borderRadius: radius.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
});
