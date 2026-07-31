import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  InteractionManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideInRight,
  SlideOutDown,
  SlideOutRight,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  PuzzleGuideMode,
  PuzzleImageAttribution,
  PuzzleTableAppearance,
  PuzzleCutterId,
} from '../../../puzzle/types';
import type { MusicSettingFeedback } from '../../../audio/musicPreference';
import {
  PUZZLE_GUIDE_OPTIONS,
  puzzleGuideLabel,
} from '../../../puzzle/types';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';
import { PUZZLE_MENU_RHYTHM } from './puzzleMenuRhythm';
import { PUZZLE_MENU_MOTION } from './puzzleMenuPresentation';

const CREDIT_LINK_HIT_SLOP = {
  top: 4,
  right: 4,
  bottom: 4,
  left: 4,
} as const;

type PuzzleMenuSheetProps = {
  visible: boolean;
  placedCount: number;
  totalCount: number;
  cutterId: PuzzleCutterId;
  guideMode: PuzzleGuideMode;
  tableAppearance: PuzzleTableAppearance;
  musicEnabled: boolean;
  musicPreferenceLoaded: boolean;
  musicFeedback: MusicSettingFeedback;
  persistenceError?: string | null;
  retryingSave?: boolean;
  attribution?: PuzzleImageAttribution;
  onClose: () => void;
  onSelectGuide: (mode: PuzzleGuideMode) => void;
  onSelectTableAppearance: (appearance: PuzzleTableAppearance) => void;
  onSetMusicEnabled: (enabled: boolean) => void;
  onRetryMusic: () => void;
  onRetrySave: () => void;
  onAssistPiece: () => void;
  onReturnLoosePieces: () => void;
  onExit: () => void;
};

export type PuzzleSavePresentation = {
  message: string;
  warning: boolean;
  retryAvailable: boolean;
};

export function puzzleSavePresentation(
  persistenceError?: string | null,
  retrying = false,
): PuzzleSavePresentation {
  if (retrying) {
    return {
      message: 'Retrying save…',
      warning: Boolean(persistenceError),
      retryAvailable: false,
    };
  }
  if (persistenceError) {
    return {
      message: persistenceError,
      warning: true,
      retryAvailable: true,
    };
  }
  return {
    message: 'Progress saves automatically',
    warning: false,
    retryAvailable: false,
  };
}

type ActionRowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  onPress: () => void;
  danger?: boolean;
};

function ActionRow({
  icon,
  title,
  detail,
  onPress,
  danger = false,
}: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.actionIcon}>
        <Ionicons
          name={icon}
          size={20}
          color={danger ? colors.danger : colors.textPrimary}
          accessible={false}
          importantForAccessibility="no"
        />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, danger && styles.dangerText]}>
          {title}
        </Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textMuted}
        accessible={false}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export function PuzzleMenuSheet({
  visible,
  placedCount,
  totalCount,
  cutterId,
  guideMode,
  tableAppearance,
  musicEnabled,
  musicPreferenceLoaded,
  musicFeedback,
  persistenceError,
  retryingSave = false,
  attribution,
  onClose,
  onSelectGuide,
  onSelectTableAppearance,
  onSetMusicEnabled,
  onRetryMusic,
  onRetrySave,
  onAssistPiece,
  onReturnLoosePieces,
  onExit,
}: PuzzleMenuSheetProps) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  // Preserve the compact side sheet at ordinary sizes. Accessibility text and
  // short landscape viewports get the full canvas so controls can wrap safely.
  const usesLargeTextLayout = fontScale >= 1.3;
  const usesExpandedLandscape =
    landscape && (usesLargeTextLayout || width < 720 || height < 390);
  const stacksControls = usesLargeTextLayout || width < 360;
  const reduceMotion = useReducedMotion();
  const savePresentation = puzzleSavePresentation(
    persistenceError,
    retryingSave,
  );
  const usesApproximateZones = cutterId === 'biomorphic';
  const headingRef = React.useRef<React.ElementRef<typeof Text>>(null);
  const overlayEntering = FadeIn.duration(
    reduceMotion
      ? PUZZLE_MENU_MOTION.reducedDurationMs
      : PUZZLE_MENU_MOTION.enterDurationMs,
  );
  const overlayExiting = FadeOut.duration(
    reduceMotion
      ? PUZZLE_MENU_MOTION.reducedDurationMs
      : PUZZLE_MENU_MOTION.exitDurationMs,
  );
  const sheetEntering = reduceMotion
    ? FadeIn.duration(PUZZLE_MENU_MOTION.reducedDurationMs)
    : (landscape ? SlideInRight : SlideInDown)
        .duration(PUZZLE_MENU_MOTION.enterDurationMs)
        .easing(Easing.out(Easing.cubic));
  const sheetExiting = reduceMotion
    ? FadeOut.duration(PUZZLE_MENU_MOTION.reducedDurationMs)
    : (landscape ? SlideOutRight : SlideOutDown)
        .duration(PUZZLE_MENU_MOTION.exitDurationMs)
        .easing(Easing.in(Easing.cubic));

  const openUrl = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    const interaction = InteractionManager.runAfterInteractions(() => {
      void AccessibilityInfo.isScreenReaderEnabled()
        .then((screenReaderEnabled) => {
          if (!screenReaderEnabled || cancelled) {
            return;
          }
          const headingNode = findNodeHandle(headingRef.current);
          if (headingNode !== null) {
            AccessibilityInfo.setAccessibilityFocus(headingNode);
          }
        })
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      entering={overlayEntering}
      exiting={overlayExiting}
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        landscape && !usesExpandedLandscape
          ? styles.overlayLandscape
          : styles.overlayPortrait,
      ]}
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
      <Animated.View
        entering={sheetEntering}
        exiting={sheetExiting}
        style={[
          styles.sheet,
          usesExpandedLandscape
            ? styles.sheetExpandedLandscape
            : landscape
              ? styles.sheetLandscape
              : styles.sheetPortrait,
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            usesExpandedLandscape && styles.contentExpandedLandscape,
            {
              paddingTop: Math.max(insets.top, spacing.lg),
              paddingRight: Math.max(insets.right, spacing.xl),
              paddingBottom: Math.max(insets.bottom, spacing.xl),
              paddingLeft: Math.max(insets.left, spacing.xl),
            },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Puzzle</Text>
                <Text
                  ref={headingRef}
                  style={styles.title}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={`Puzzle menu. ${placedCount} of ${totalCount} placed`}
                >
                  {placedCount} of {totalCount} placed
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close puzzle menu"
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

            <View style={styles.saveStatusRow}>
              <Text
                style={[
                  styles.autosave,
                  savePresentation.warning && styles.saveWarning,
                ]}
                accessibilityLiveRegion="polite"
                accessibilityRole={
                  savePresentation.warning ? 'alert' : undefined
                }
              >
                {savePresentation.message}
              </Text>
              {savePresentation.retryAvailable ? (
                <Pressable
                  onPress={onRetrySave}
                  accessibilityRole="button"
                  accessibilityLabel="Retry saving puzzle progress"
                  accessibilityHint="Attempts to save the current puzzle again"
                  style={({ pressed }) => [
                    styles.retrySaveButton,
                    pressed && styles.linkPressed,
                  ]}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={colors.textPrimary}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                  <Text style={styles.retrySaveLabel}>Retry save</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Table</Text>
              <Text style={styles.sectionDetail}>
                Choose a quiet felt surface or photo-tinted glass
              </Text>
              <View
                style={[
                  styles.guideGrid,
                  stacksControls && styles.guideGridStacked,
                ]}
              >
              {(
                [
                  {
                    id: 'photo-glass',
                    label: 'Photo glass',
                    icon: 'image-outline',
                  },
                  {
                    id: 'felt',
                    label: 'Dark felt',
                    icon: 'layers-outline',
                  },
                ] as const
              ).map((option) => {
                const selected = option.id === tableAppearance;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => onSelectTableAppearance(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    style={({ pressed }) => [
                      styles.guideOption,
                      stacksControls && styles.guideOptionStacked,
                      selected && styles.guideOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={
                        selected ? colors.onAccent : colors.textSecondary
                      }
                      accessible={false}
                      importantForAccessibility="no"
                    />
                    <Text
                      style={[
                        styles.guideLabel,
                        selected && styles.guideLabelSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              </View>
            </View>

            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Board help</Text>
              <Text style={styles.sectionDetail}>
                Current:{' '}
                {usesApproximateZones && guideMode === 'grid'
                  ? 'Zones'
                  : puzzleGuideLabel(guideMode)}
              </Text>
              <View
                style={[
                  styles.guideGrid,
                  stacksControls && styles.guideGridStacked,
                ]}
              >
              {PUZZLE_GUIDE_OPTIONS.map((option) => {
                const selected = option.id === guideMode;
                const isZoneGuide =
                  usesApproximateZones && option.id === 'grid';
                const optionLabel = isZoneGuide ? 'Zones' : option.label;
                const optionDetail = isZoneGuide
                  ? 'Approximate placement zones'
                  : option.detail;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => onSelectGuide(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={optionLabel}
                    accessibilityHint={optionDetail}
                    style={({ pressed }) => [
                      styles.guideOption,
                      stacksControls && styles.guideOptionStacked,
                      selected && styles.guideOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={
                        option.id === 'none'
                          ? 'eye-off-outline'
                          : option.id === 'grid'
                            ? 'grid-outline'
                            : option.id === 'image'
                              ? 'image-outline'
                              : 'shapes-outline'
                      }
                      size={18}
                      color={selected ? colors.onAccent : colors.textSecondary}
                      accessible={false}
                      importantForAccessibility="no"
                    />
                    <Text
                      style={[
                        styles.guideLabel,
                        selected && styles.guideLabelSelected,
                      ]}
                    >
                      {optionLabel}
                    </Text>
                  </Pressable>
                );
              })}
              </View>
            </View>

            <View style={styles.menuSection}>
              <Text style={styles.sectionLabel}>Sound</Text>
              <View
                style={[
                  styles.settingRow,
                  stacksControls && styles.settingRowStacked,
                ]}
              >
                <View style={styles.settingInfo}>
                  <View style={styles.actionIcon}>
                    <Ionicons
                      name={
                        musicFeedback.kind === 'error'
                          ? 'alert-circle-outline'
                          : musicEnabled
                            ? 'musical-notes-outline'
                            : 'volume-mute-outline'
                      }
                      size={20}
                      color={
                        musicFeedback.kind === 'error'
                          ? colors.danger
                          : colors.textPrimary
                      }
                      accessible={false}
                      importantForAccessibility="no"
                    />
                  </View>
                  <View style={styles.actionCopy}>
                    <Text style={styles.actionTitle}>Music</Text>
                    <Text
                      style={[
                        styles.actionDetail,
                        musicFeedback.kind === 'error' && styles.settingError,
                      ]}
                      accessibilityLiveRegion="polite"
                    >
                      {musicFeedback.message}
                    </Text>
                    {musicFeedback.retryAvailable ? (
                      <Pressable
                        onPress={onRetryMusic}
                        accessibilityRole="button"
                        accessibilityLabel={musicFeedback.retryLabel}
                        accessibilityHint={
                          musicFeedback.retryLabel === 'Retry saving'
                            ? 'Attempts to save the current music setting again'
                            : 'Attempts to load and play the background music again'
                        }
                        style={({ pressed }) => [
                          styles.retryMusicButton,
                          pressed && styles.linkPressed,
                        ]}
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={16}
                          color={colors.textPrimary}
                          accessible={false}
                          importantForAccessibility="no"
                        />
                        <Text style={styles.retryMusicLabel}>
                          {musicFeedback.retryLabel}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <Switch
                  value={musicEnabled}
                  disabled={!musicPreferenceLoaded}
                  onValueChange={onSetMusicEnabled}
                  accessibilityLabel="Background music"
                  accessibilityHint={
                    musicFeedback.kind === 'error'
                      ? musicFeedback.message
                      : 'Plays calm music while solving puzzles'
                  }
                  accessibilityValue={{
                    text: musicPreferenceLoaded
                      ? `${musicEnabled ? 'On' : 'Off'}. ${musicFeedback.message}`
                      : 'Loading setting',
                  }}
                  trackColor={{ false: colors.borderStrong, true: colors.accent }}
                  thumbColor={colors.textPrimary}
                  ios_backgroundColor={colors.surfaceRaised}
                  style={stacksControls ? styles.settingSwitchStacked : undefined}
                />
              </View>
            </View>

            <View style={styles.sectionDivider} />
            <ActionRow
              icon="sparkles-outline"
              title="Place one piece"
              detail="Assist moves the next loose piece into place"
              onPress={onAssistPiece}
            />
            <ActionRow
              icon="return-down-back-outline"
              title="Return loose pieces"
              detail="Moves every unsolved piece back to the tray"
              onPress={onReturnLoosePieces}
            />

            {attribution ? (
              <>
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionLabel}>Photograph</Text>
                <View style={styles.creditLine}>
                  <Text style={styles.creditText}>Photo by </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${attribution.photographerName}'s Unsplash profile`}
                    onPress={() => openUrl(attribution.photographerUrl)}
                    hitSlop={CREDIT_LINK_HIT_SLOP}
                    style={({ pressed }) => [
                      styles.creditLinkTarget,
                      pressed && styles.linkPressed,
                    ]}
                  >
                    <Text style={styles.creditLink}>
                      {attribution.photographerName}
                    </Text>
                  </Pressable>
                  <Text style={styles.creditText}> on </Text>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${attribution.sourceName}`}
                    onPress={() => openUrl(attribution.sourceUrl)}
                    hitSlop={CREDIT_LINK_HIT_SLOP}
                    style={({ pressed }) => [
                      styles.creditLinkTarget,
                      pressed && styles.linkPressed,
                    ]}
                  >
                    <Text style={styles.creditLink}>
                      {attribution.sourceName}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <View style={styles.sectionDivider} />
            <ActionRow
              icon="exit-outline"
              title="Leave puzzle"
              detail={
                persistenceError
                  ? 'Returns home; recent progress may not be saved'
                  : 'Returns home; progress remains saved'
              }
              onPress={onExit}
              danger
            />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.54)',
    zIndex: 100,
  },
  overlayPortrait: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  overlayLandscape: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  sheetPortrait: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    borderWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetLandscape: {
    width: 390,
    maxWidth: '46%',
    height: '100%',
    borderLeftWidth: 1,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
  },
  sheetExpandedLandscape: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  scroll: {
    width: '100%',
  },
  content: {
    flexGrow: 1,
  },
  contentExpandedLandscape: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  header: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: spacing.xs,
  },
  closeButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  autosave: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  saveStatusRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: PUZZLE_MENU_RHYTHM.betweenSections,
  },
  saveWarning: {
    color: colors.danger,
  },
  retrySaveButton: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  retrySaveLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  menuSection: {
    marginBottom: PUZZLE_MENU_RHYTHM.betweenSections,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: PUZZLE_MENU_RHYTHM.titleToDetail,
  },
  guideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: PUZZLE_MENU_RHYTHM.detailToControls,
  },
  guideGridStacked: {
    flexDirection: 'column',
  },
  guideOption: {
    minWidth: '46%',
    minHeight: MIN_TOUCH_TARGET,
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: PUZZLE_MENU_RHYTHM.controlPaddingVertical,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
  },
  guideOptionStacked: {
    width: '100%',
    minWidth: '100%',
    flexBasis: 'auto',
    flexGrow: 0,
  },
  guideOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  guideLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  guideLabelSelected: {
    color: colors.onAccent,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 0,
    marginBottom: spacing.xl,
  },
  actionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  settingRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: PUZZLE_MENU_RHYTHM.detailToControls,
  },
  settingRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  settingInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingSwitchStacked: {
    alignSelf: 'flex-start',
    marginLeft: 36 + spacing.md,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  actionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  settingError: {
    color: colors.danger,
  },
  retryMusicButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingRight: spacing.sm,
  },
  retryMusicLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  dangerText: {
    color: colors.danger,
  },
  creditLine: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  creditText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  creditLink: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  creditLinkTarget: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.985 }],
  },
  linkPressed: {
    opacity: 0.7,
  },
});
