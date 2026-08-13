import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';
import { HOW_TO_PLAY_STEPS } from './howToPlayPresentation';

type HowToPlaySheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function HowToPlaySheet({ visible, onClose }: HowToPlaySheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const headingRef = React.useRef<React.ElementRef<typeof Text>>(null);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    const interaction = InteractionManager.runAfterInteractions(() => {
      void AccessibilityInfo.isScreenReaderEnabled()
        .then((enabled) => {
          if (!enabled || cancelled) {
            return;
          }
          const heading = findNodeHandle(headingRef.current);
          if (heading !== null) {
            AccessibilityInfo.setAccessibilityFocus(heading);
          }
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      interaction.cancel();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View
        style={styles.overlay}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View style={styles.sheet}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: spacing.md,
                paddingRight: Math.max(insets.right, spacing.xl),
                paddingBottom: Math.max(insets.bottom, spacing.xl),
                paddingLeft: Math.max(insets.left, spacing.xl),
              },
            ]}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.handle} />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close How to Play"
                accessibilityHint="Returns to the puzzle"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textPrimary}
                  accessible={false}
                  importantForAccessibility="no"
                />
              </Pressable>
            </View>

            <Text style={styles.eyebrow}>Puzzle guide</Text>
            <Text
              ref={headingRef}
              style={styles.title}
              accessibilityRole="header"
              accessible
            >
              How to Play
            </Text>
            <Text style={styles.intro}>
              One finger moves pieces. Two fingers move your view.
            </Text>

            <View style={styles.steps} accessibilityRole="list">
              {HOW_TO_PLAY_STEPS.map((step, index) => (
                <View
                  key={step.title}
                  style={styles.step}
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${index + 1} of ${HOW_TO_PLAY_STEPS.length}. ${step.title}. ${step.detail}`}
                >
                  <View
                    style={styles.stepIcon}
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    <Ionicons
                      name={step.icon}
                      size={21}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.stepCopy}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDetail}>{step.detail}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Button label="Got it" onPress={onClose} block />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
  },
  content: {
    flexGrow: 1,
  },
  header: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
    marginTop: spacing.xs,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  steps: {
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  step: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(216, 162, 74, 0.12)',
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  stepDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
