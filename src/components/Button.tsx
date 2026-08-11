import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  accessibilityHint?: string;
  /** Opt in to filling the row; buttons are sized to their label by default. */
  block?: boolean;
  style?: ViewStyle;
};

/**
 * Buttons size to their label with a comfortable touch target rather than
 * stretching edge to edge. A full-bleed button reads as a form submit and makes
 * every screen look like a settings sheet; `block` is available for the rare
 * case that genuinely wants it.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
  block = false,
  style,
}: ButtonProps) {
  return (
    <View style={block ? styles.blockWrap : styles.inlineWrap}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          styles.base,
          styles[variant],
          block && styles.block,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineWrap: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  blockWrap: { alignSelf: 'stretch' },
  base: {
    minHeight: MIN_TOUCH_TARGET,
    maxWidth: '100%',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
  },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  label: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryLabel: { color: colors.onAccent },
  secondaryLabel: { color: colors.textPrimary },
  ghostLabel: { color: colors.textSecondary },
});
