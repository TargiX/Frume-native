import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

/** Beyond this a text column stops being readable and starts being a banner. */
const MAX_CONTENT_WIDTH = 680;

type ScreenProps = {
  children: React.ReactNode;
  /** Centres content vertically as well as horizontally. */
  centered?: boolean;
  /** Allows compact phones and larger Dynamic Type sizes to reach every control. */
  scroll?: boolean;
  /** Include the top safe area when the native navigation header is hidden. */
  safeTop?: boolean;
  style?: ViewStyle;
};

/**
 * Caps and centres content instead of letting it span a tablet edge to edge.
 * Without this every screen stretches to ~1300pt on an iPad, which turns cards
 * into billboards and leaves the eye with nowhere to rest.
 */
export function Screen({
  children,
  centered = false,
  scroll = false,
  safeTop = false,
  style,
}: ScreenProps) {
  const edges = safeTop
    ? (['top', 'right', 'bottom', 'left'] as const)
    : (['right', 'bottom', 'left'] as const);

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            styles.scrollContent,
            centered && styles.scrollContentCentered,
            style,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            centered && styles.contentCentered,
            style,
          ]}
        >
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    padding: spacing.xl,
    alignSelf: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentCentered: {
    justifyContent: 'center',
  },
  contentCentered: {
    flex: 1,
    justifyContent: 'center',
  },
});
