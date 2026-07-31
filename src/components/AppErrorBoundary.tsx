import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../theme';
import { Button } from './Button';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  failed: boolean;
  resetKey: number;
};

/**
 * Keeps an unexpected render/runtime exception from leaving a permanent blank
 * screen. The recovery copy deliberately avoids exposing exception details;
 * React still reports the original error to the development console.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false, resetKey: 0 };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(): void {
    AccessibilityInfo.announceForAccessibility(
      'Something went wrong. Your saved puzzle is still safe.',
    );
  }

  private retry = (): void => {
    this.setState(({ resetKey }) => ({
      failed: false,
      resetKey: resetKey + 1,
    }));
  };

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.screen} accessibilityViewIsModal>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Frume</Text>
            <Text style={styles.title} accessibilityRole="header">
              Let’s reset the table
            </Text>
            <Text style={styles.body}>
              Something unexpected happened. Your saved puzzle is still safe,
              so you can reopen the experience without losing progress.
            </Text>
            <Button
              label="Try again"
              onPress={this.retry}
              accessibilityHint="Reloads the puzzle experience"
              block
            />
          </View>
        </View>
      );
    }

    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.xxl,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
});
