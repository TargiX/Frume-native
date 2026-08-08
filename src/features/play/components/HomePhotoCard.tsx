import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '../../../theme';

/** Critically damped: the card settles under the finger without wobbling. */
const PRESS_SPRING = { damping: 26, stiffness: 320, mass: 0.7 } as const;
const PRESSED_SCALE = 0.975;

/**
 * Two hints of further photographs behind the current one. Small rotations
 * only: a fan wide enough to notice is a graphic, not a stack on a table.
 */
const STACK_LAYERS = [
  { rotate: '4deg', translateX: 7, translateY: 7, tint: 'rgba(238, 228, 213, 0.13)' },
  { rotate: '-2.5deg', translateX: -5, translateY: 4, tint: 'rgba(240, 231, 217, 0.22)' },
] as const;

type HomePhotoCardProps = {
  source: ImageSourcePropType;
  /** Photograph aspect, so the print keeps the shape it will be cut into. */
  aspectRatio: number;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  /** Placed / total, shown as a quiet plate on the print. */
  progress?: { placed: number; total: number };
  caption?: string;
};

/**
 * The current photograph, presented as a print lying on the table rather than
 * as a banner: paper border, real shadow, a slight tilt, and the whole thing is
 * the primary control. Tapping the photograph is how you get back into it.
 */
/**
 * The print is fitted into a box rather than given a width: a landscape
 * photograph handed a percentage width overflows the screen, and a tall one
 * pushes the actions off the bottom.
 */
const MAX_PRINT_WIDTH_FRACTION = 0.66;
const MAX_PRINT_HEIGHT_FRACTION = 0.46;

function fitPrint(
  aspectRatio: number,
  windowWidth: number,
  windowHeight: number,
): { width: number; height: number } {
  const boxWidth = windowWidth * MAX_PRINT_WIDTH_FRACTION;
  const boxHeight = windowHeight * MAX_PRINT_HEIGHT_FRACTION;
  const safeAspect =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const width = Math.min(boxWidth, boxHeight * safeAspect);
  return { width, height: width / safeAspect };
}

export function HomePhotoCard({
  source,
  aspectRatio,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  progress,
  caption,
}: HomePhotoCardProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const print = fitPrint(aspectRatio, windowWidth, windowHeight);
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion
          ? 1
          : 1 - pressed.value * (1 - PRESSED_SCALE),
      },
    ],
  }));

  return (
    <View style={styles.stage}>
      {STACK_LAYERS.map((layer) => (
        <View
          key={layer.rotate}
          style={[
            styles.print,
            styles.stackLayer,
            {
              width: print.width,
              height: print.height,
              backgroundColor: layer.tint,
              transform: [
                { translateX: layer.translateX },
                { translateY: layer.translateY },
                { rotate: layer.rotate },
              ],
            },
          ]}
          pointerEvents="none"
        />
      ))}
      <Pressable
        onPressIn={() => {
          // Feedback belongs to the press, not the release.
          pressed.value = withSpring(1, PRESS_SPRING);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, PRESS_SPRING);
        }}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
      >
        <Animated.View
          style={[
            styles.print,
            styles.frontPrint,
            { width: print.width, height: print.height },
            cardStyle,
            disabled && styles.disabled,
          ]}
        >
          <View style={styles.photoFrame}>
            <Image
              source={source}
              style={styles.photo}
              resizeMode="cover"
              accessible={false}
            />
          </View>
          {progress ? (
            <View style={styles.progressPlate}>
              <View style={styles.progressDot} />
              <Text style={styles.progressLabel}>
                {progress.placed} of {progress.total}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  print: {
    borderRadius: radius.lg,
    // Paper, not glass: a warm off-white border reads as the margin of a print.
    backgroundColor: 'rgba(245, 239, 230, 0.94)',
    padding: 7,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  frontPrint: {
    transform: [{ rotate: '-1.5deg' }],
  },
  stackLayer: {
    position: 'absolute',
    // No shadow on the layers underneath: stacked shadows pool into grey
    // smudges beside the print instead of reading as further photographs.
    shadowOpacity: 0,
    elevation: 0,
  },
  // The frame does the clipping: an Image left to its own devices takes its
  // intrinsic width and spills out past the paper border.
  photoFrame: {
    flex: 1,
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  progressPlate: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12, 10, 8, 0.62)',
  },
  progressDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  progressLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  caption: {
    marginTop: spacing.lg,
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
