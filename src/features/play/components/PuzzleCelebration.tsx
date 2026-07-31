import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  Keyframe,
  ZoomIn,
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
 * A single compact reward surface keeps the finished photograph visible while
 * giving completion a clear, joyful focal point.
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
  useAccessibilityAnnouncement(nextError ?? null);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(
      `Puzzle complete in ${formatElapsed(elapsedMs)}`,
    );
  }, [elapsedMs, reduceMotion]);

  const cardEntering = reduceMotion
    ? FadeIn.duration(CELEBRATION_MOTION.reducedDurationMs)
    : ZoomIn
        .delay(CELEBRATION_MOTION.cardDelayMs)
        .duration(CELEBRATION_MOTION.cardDurationMs)
        .easing(Easing.out(Easing.cubic));
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, spacing.xl),
            paddingRight: Math.max(insets.right, spacing.xl),
            paddingBottom: Math.max(insets.bottom, spacing.xl),
            paddingLeft: Math.max(insets.left, spacing.xl),
          },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={cardEntering} style={styles.card}>
          <View
            style={styles.badge}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons
              name="sparkles"
              size={22}
              color={colors.onAccent}
            />
          </View>
          <Text style={styles.eyebrow}>Completed</Text>
          <Text style={styles.title} accessibilityRole="header">
            Puzzle complete!
          </Text>
          <Text style={styles.subtitle}>
            Finished in {formatElapsed(elapsedMs)}
          </Text>

          <View style={styles.primaryAction}>
            <Button
              label={nextLoading ? 'Finding next puzzle…' : 'Next puzzle'}
              onPress={onNext}
              disabled={nextLoading}
              block
            />
          </View>
          {nextError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {nextError}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <View style={styles.actionSlot}>
              <Button
                label="Play again"
                variant="secondary"
                onPress={onPlayAgain}
                block
              />
            </View>
            <View style={styles.actionSlot}>
              <Button
                label="Home"
                variant="secondary"
                onPress={onHome}
                block
              />
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 8, 6, 0.18)',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderRadius: 24,
    backgroundColor: 'rgba(30, 27, 24, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(228, 170, 71, 0.46)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.42,
    shadowRadius: 28,
    elevation: 16,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginBottom: spacing.md,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  primaryAction: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
  actionSlot: {
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 132,
  },
  confetti: {
    position: 'absolute',
    borderRadius: radius.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
