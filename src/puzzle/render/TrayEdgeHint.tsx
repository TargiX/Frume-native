import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

type TrayEdgeHintProps = {
  side: 'left' | 'right' | 'top' | 'bottom';
  /** Edge of the remaining pieces, in tray-content space. */
  edge: number;
  trayScroll: SharedValue<number>;
  viewportExtent: number;
  crossExtent: number;
};

/**
 * Marks pieces waiting beyond the edge of the strip.
 *
 * A tray that scrolls with nothing to show for it reads as a tray with nothing
 * in it — a player has no reason to suspect the row continues past the screen.
 * Fades in only while something is actually out there.
 */
export function TrayEdgeHint({
  side,
  edge,
  trayScroll,
  viewportExtent,
  crossExtent,
}: TrayEdgeHintProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const windowLeft = -trayScroll.value;
    const overflow =
      side === 'left' || side === 'top'
        ? windowLeft - edge
        : edge - (windowLeft + viewportExtent);

    return { opacity: Math.min(1, Math.max(0, overflow / 40)) };
  });
  const verticalTray = side === 'top' || side === 'bottom';
  const icon =
    side === 'left'
      ? 'chevron-back'
      : side === 'right'
        ? 'chevron-forward'
        : side === 'top'
          ? 'chevron-up'
          : 'chevron-down';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.hint,
        verticalTray
          ? { width: crossExtent, height: 40 }
          : { width: 40, height: crossExtent },
        styles[side],
        animatedStyle,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color="rgba(255, 246, 232, 0.5)"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: { left: 0, top: 0 },
  right: { right: 0, top: 0 },
  top: { left: 0, top: 0 },
  bottom: { left: 0, bottom: 0 },
});
