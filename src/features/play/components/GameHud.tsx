import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, MIN_TOUCH_TARGET, spacing } from '../../../theme';
import { puzzleMenuHudSide } from './puzzleMenuPresentation';

type GameHudProps = {
  placedCount: number;
  totalCount: number;
  activeElapsedMs: number;
  activeStartedAt: number | null;
  onOpenMenu: () => void;
};

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function GameHud({
  placedCount,
  totalCount,
  activeElapsedMs,
  activeStartedAt,
  onOpenMenu,
}: GameHudProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const landscape = width > height;
  const hudSide = puzzleMenuHudSide();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = formatElapsed(
    activeElapsedMs +
      (activeStartedAt === null ? 0 : Math.max(0, now - activeStartedAt)),
  );
  return (
    <View
      style={[
        styles.wrapper,
        landscape
          ? {
              top: insets.top + spacing.sm,
              [hudSide]: insets.right + spacing.md,
            }
          : {
              top: insets.top + spacing.sm,
              right: insets.right + spacing.md,
            },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onOpenMenu}
        style={({ pressed }) => [
          styles.menuButton,
          pressed && styles.menuButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Open puzzle menu. ${placedCount} of ${totalCount} pieces placed. ${elapsed} elapsed.`}
        accessibilityHint="Shows progress, board help, Assist, photo credit, and puzzle options"
      >
        <Ionicons
          name="menu-outline"
          size={22}
          color="#fff"
          accessible={false}
          importantForAccessibility="no"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
  },
  menuButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 10, 8, 0.76)',
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
  },
  menuButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    transform: [{ scale: 0.96 }],
  },
});
