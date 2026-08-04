import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccessibilityAnnouncement } from '../../../accessibility';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import type { PlayStackParamList } from '../../../navigation/types';
import { isPremiumCutter, usePremiumAccess } from '../../../premium';
import { usePuzzleSessionContext } from '../../../puzzle/context';
import { PREMIUM_CUTS_REQUIRED_ERROR } from '../../../puzzle/hooks/usePuzzleSession';
import {
  DIFFICULTY_GRID,
  PUZZLE_GUIDE_OPTIONS,
  type PuzzleCutterId,
  type PuzzleDifficulty,
  type PuzzleGuideMode,
} from '../../../puzzle/types';
import { enqueuePhotoUse } from '../../../services/unsplash';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';
import { CutStylePreview } from '../components/CutStylePreview';
import { PremiumCutsSheet } from '../components/PremiumCutsSheet';
import { computeSafeAreaPlayLayout } from '../utils/boardLayout';
import { resolveDifficultyScreenLayout } from '../utils/difficultyLayout';

type Props = NativeStackScreenProps<PlayStackParamList, 'Difficulty'>;

const DIFFICULTIES: { id: PuzzleDifficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

const GUIDE_ICONS: Record<
  PuzzleGuideMode,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  none: 'eye-off-outline',
  grid: 'grid-outline',
  cuts: 'shapes-outline',
  image: 'image-outline',
};

const ATTRIBUTION_HIT_SLOP = {
  top: spacing.xs,
  right: spacing.xs,
  bottom: spacing.xs,
  left: spacing.xs,
} as const;

type PlayableCutterId = Exclude<PuzzleCutterId, 'fractal'>;

const CUT_STYLES: {
  id: PlayableCutterId;
  label: string;
  detail: string;
}[] = [
  {
    id: 'classic',
    label: 'Classic',
    detail: 'Familiar interlocking tabs',
  },
  {
    id: 'organic',
    label: 'Organic',
    detail: 'Flowing, irregular seams',
  },
  {
    id: 'biomorphic',
    label: 'Living',
    detail: 'Crystal-grown, branching cells',
  },
  {
    id: 'amoeba',
    label: 'Amoeba',
    detail: 'Blobby, pseudopod interlocks',
  },
];

function GridPreview({
  difficulty,
  active,
}: {
  difficulty: PuzzleDifficulty;
  active: boolean;
}) {
  const { rows, columns } = DIFFICULTY_GRID[difficulty];

  return (
    <View style={styles.gridPreview} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={styles.gridRow}>
          {Array.from({ length: columns }).map((__, col) => (
            <View
              key={col}
              style={[styles.gridCell, active && styles.gridCellActive]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function DifficultyScreen({ navigation, route }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    imageUri,
    imageWidth,
    imageHeight,
    photographerName,
    photographerUrl,
    photoDescription,
    categoryLabel,
    downloadLocation,
    trackingToken,
  } = route.params;
  const { startSession, clearSession, loading, error } =
    usePuzzleSessionContext();
  const { isPremium } = usePremiumAccess();
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<PuzzleDifficulty>('easy');
  const [selectedCutter, setSelectedCutter] =
    useState<PlayableCutterId>('classic');
  const [selectedGuideMode, setSelectedGuideMode] =
    useState<PuzzleGuideMode>('cuts');
  const [showPremium, setShowPremium] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const visibleError = imageError
    ? 'The photograph could not be loaded. Go back and choose another.'
    : trackingError ?? error;
  useAccessibilityAnnouncement(visibleError);
  const startingRef = useRef(false);
  const premiumStartPendingRef = useRef(false);
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 4 / 3;
  const playLayout = useMemo(
    () =>
      computeSafeAreaPlayLayout(width, height, insets, imageAspect),
    [
      height,
      imageAspect,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      width,
    ],
  );
  const { twoPane } = resolveDifficultyScreenLayout({
    width,
    height,
    fontScale,
  });
  const selectedCut =
    CUT_STYLES.find((option) => option.id === selectedCutter) ?? CUT_STYLES[0];
  const selectedCutLocked =
    isPremiumCutter(selectedCutter) && !isPremium;

  const openPremiumCuts = () => {
    setShowPremium(true);
  };

  const closePremiumCuts = () => {
    setShowPremium(false);
  };

  const onCutStylePress = (cutterId: PlayableCutterId) => {
    setSelectedCutter(cutterId);
    premiumStartPendingRef.current = false;
  };

  useEffect(() => {
    if (!premiumStartPendingRef.current || !error) {
      return;
    }
    premiumStartPendingRef.current = false;
    if (
      error === PREMIUM_CUTS_REQUIRED_ERROR &&
      isPremiumCutter(selectedCutter)
    ) {
      openPremiumCuts();
    }
  }, [error, selectedCutter]);

  const onPlay = async () => {
    if (selectedCutLocked) {
      openPremiumCuts();
      return;
    }
    if (startingRef.current) {
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setTrackingError(null);
    premiumStartPendingRef.current = isPremiumCutter(selectedCutter);
    try {
      const started = await startSession({
        image: {
          uri: imageUri,
          width: imageWidth,
          height: imageHeight,
          accessibilityLabel:
            photoDescription ??
            (categoryLabel
              ? `${categoryLabel} puzzle photograph`
              : 'Puzzle photograph'),
          attribution:
            photographerName && photographerUrl
              ? {
                  photographerName,
                  photographerUrl,
                  sourceName: 'Unsplash',
                  sourceUrl:
                    'https://unsplash.com/?utm_source=frume&utm_medium=referral',
                }
              : undefined,
        },
        cutterId: selectedCutter,
        difficulty: selectedDifficulty,
        guideMode: selectedGuideMode,
        boardMaxWidth: playLayout.boardWidth,
        boardMaxHeight: playLayout.boardHeight,
        trayPlacement: playLayout.trayPlacement,
      });
      if (!started) {
        return;
      }
      premiumStartPendingRef.current = false;

      // Persist required provider tracking before leaving setup. The network
      // drain runs in the background and is retried on the next launch.
      try {
        await enqueuePhotoUse(
          { links: { download_location: downloadLocation } },
          trackingToken,
        );
      } catch {
        // Do not leave a resumable session behind when its required photo-use
        // event could not be persisted.
        clearSession();
        setTrackingError(
          'This photo could not be prepared for play. Check your connection or device storage, then try again.',
        );
        return;
      }
      navigation.navigate('Game', { difficulty: selectedDifficulty });
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  const openPhotographer = () => {
    if (photographerUrl) {
      void Linking.openURL(photographerUrl).catch(() => undefined);
    }
  };

  const openUnsplash = () => {
    void Linking.openURL(
      'https://unsplash.com/?utm_source=frume&utm_medium=referral',
    ).catch(() => undefined);
  };

  const photoPanel = (
    <>
      <View
        style={[
          styles.previewCard,
          twoPane && styles.previewCardLandscape,
        ]}
      >
        {imageLoading && !imageError ? (
          <ActivityIndicator
            style={styles.previewStatus}
            color={colors.accent}
            accessibilityLabel="Loading puzzle photograph"
          />
        ) : null}
        {imageError ? (
          <Text style={styles.previewError} accessibilityLiveRegion="polite">
            The photograph could not be loaded. Go back and choose another.
          </Text>
        ) : null}
        <Image
          source={{ uri: imageUri }}
          style={[styles.preview, imageError && styles.previewHidden]}
          resizeMode="contain"
          accessibilityLabel={
            photoDescription ??
            (categoryLabel
              ? `${categoryLabel} puzzle photograph`
              : 'Puzzle photograph')
          }
          onLoadStart={() => {
            setImageLoading(true);
            setImageError(false);
          }}
          onLoadEnd={() => setImageLoading(false)}
          onError={() => {
            setImageLoading(false);
            setImageError(true);
          }}
        />
      </View>

      <View style={[styles.meta, twoPane && styles.metaLandscape]}>
        {categoryLabel ? <Text style={styles.category}>{categoryLabel}</Text> : null}
        {photographerName ? (
          <View style={styles.credit}>
            <Text style={styles.creditText}>Photo by</Text>
            {photographerUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open ${photographerName}'s Unsplash profile`}
                hitSlop={ATTRIBUTION_HIT_SLOP}
                onPress={openPhotographer}
                style={({ pressed }) => [
                  styles.creditLinkTarget,
                  pressed && styles.creditLinkPressed,
                ]}
              >
                <Text style={styles.creditLink}>{photographerName}</Text>
              </Pressable>
            ) : (
              <Text style={styles.creditText}>{photographerName}</Text>
            )}
            <Text style={styles.creditText}>on</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open the Unsplash home page"
              hitSlop={ATTRIBUTION_HIT_SLOP}
              onPress={openUnsplash}
              style={({ pressed }) => [
                styles.creditLinkTarget,
                pressed && styles.creditLinkPressed,
              ]}
            >
              <Text style={styles.creditLink}>Unsplash</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );

  const choicesPanel = (
    <>
      <Text
        style={[styles.title, twoPane && styles.firstLandscapeTitle]}
        accessibilityRole="header"
      >
        Choose a cut
      </Text>
      <View style={styles.cutOptions} accessibilityRole="radiogroup">
        {CUT_STYLES.map((option) => {
          const active = selectedCutter === option.id;
          const locked = isPremiumCutter(option.id) && !isPremium;
          const status = locked
            ? active
              ? 'Premium · Unlock to play'
              : 'Premium'
            : option.id === 'classic'
              ? 'Free'
              : 'Premium unlocked';

          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: loading }}
              accessibilityLabel={`${option.label}. ${option.detail}. ${status}`}
              disabled={loading}
              style={({ pressed }) => [
                styles.cutOption,
                active && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              onPress={() => onCutStylePress(option.id)}
            >
              <CutStylePreview cutterId={option.id} active={active} />
              <View style={styles.cutCopy}>
                <View style={styles.cutTitleRow}>
                  <Text
                    style={[
                      styles.optionLabel,
                      active && styles.optionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {locked ? (
                    <Ionicons
                      name="lock-closed"
                      size={16}
                      color={colors.accent}
                      accessible={false}
                      importantForAccessibility="no"
                    />
                  ) : active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.accent}
                      accessible={false}
                      importantForAccessibility="no"
                    />
                  ) : null}
                </View>
                <Text style={styles.cutDetail}>{option.detail}</Text>
                <Text style={locked ? styles.premiumBadge : styles.freeBadge}>
                  {status}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Choose difficulty
      </Text>
      <Text style={styles.sectionHint}>
        Every piece count is free. Pick what feels comfortable.
      </Text>

      <View style={styles.difficultyOptions} accessibilityRole="radiogroup">
        {DIFFICULTIES.map((option) => {
          const active = selectedDifficulty === option.id;
          const { rows, columns } = DIFFICULTY_GRID[option.id];

          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: loading }}
              accessibilityLabel={`${option.label}, ${rows * columns} pieces`}
              disabled={loading}
              style={({ pressed }) => [
                styles.difficultyOption,
                active && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
              onPress={() => setSelectedDifficulty(option.id)}
            >
              <GridPreview difficulty={option.id} active={active} />
              <View style={styles.optionTitleRow}>
                <Text
                  style={[
                    styles.optionLabel,
                    active && styles.optionLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
                {active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={colors.accent}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                ) : null}
              </View>
              <Text style={styles.optionDetail}>{rows * columns} pieces</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.title} accessibilityRole="header">
        Board help
      </Text>
      <Text style={styles.sectionHint}>
        Independent from piece count. You can change it while playing.
      </Text>

      <View style={styles.guideOptions} accessibilityRole="radiogroup">
        {PUZZLE_GUIDE_OPTIONS.map((option) => {
          const active = selectedGuideMode === option.id;
          const livingZones =
            (selectedCutter === 'biomorphic' || selectedCutter === 'amoeba') &&
            option.id === 'grid';
          const label = livingZones ? 'Zones' : option.label;
          const detail = livingZones
            ? 'Approximate placement zones'
            : option.detail;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: loading }}
              accessibilityLabel={`${label}. ${detail}`}
              disabled={loading}
              onPress={() => setSelectedGuideMode(option.id)}
              style={({ pressed }) => [
                styles.guideOption,
                active && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <View
                style={styles.guideIcon}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons
                  name={GUIDE_ICONS[option.id]}
                  size={23}
                  color={active ? colors.accent : colors.textSecondary}
                />
              </View>
              <View style={styles.guideCopy}>
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionLabel,
                      active && styles.optionLabelActive,
                    ]}
                  >
                    {label}
                  </Text>
                  {active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color={colors.accent}
                      accessible={false}
                      importantForAccessibility="no"
                    />
                  ) : null}
                </View>
                <Text style={styles.optionDetail}>{detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const actionPanel = (
    <View style={[styles.actionPanel, twoPane && styles.actionPanelLandscape]}>
      {trackingError || error ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="assertive"
          numberOfLines={twoPane ? 2 : undefined}
        >
          {trackingError ?? error}
        </Text>
      ) : null}

      <Button
        label={
          selectedCutLocked
            ? `Unlock ${selectedCut.label} cuts`
            : loading || starting
              ? 'Preparing…'
              : 'Start puzzle'
        }
        onPress={onPlay}
        disabled={loading || starting || imageError}
        accessibilityHint={
          selectedCutLocked
            ? `Opens the permanent Premium Cuts purchase for ${selectedCut.label}`
            : `Starts ${selectedDifficulty === 'easy' ? 'an' : 'a'} ${selectedDifficulty} ${selectedCut.label} puzzle`
        }
        block
      />
    </View>
  );

  return (
    <>
      {twoPane ? (
        <Screen style={styles.landscapeScreen}>
          <View style={styles.landscapeColumns}>
            <View style={styles.landscapePhotoColumn}>
              {photoPanel}
              {actionPanel}
            </View>
            <View style={styles.landscapeDivider} />
            <ScrollView
              style={styles.landscapeChoices}
              contentContainerStyle={styles.landscapeChoicesContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {choicesPanel}
            </ScrollView>
          </View>
        </Screen>
      ) : (
        <Screen scroll style={styles.content}>
          {photoPanel}
          {choicesPanel}
          {actionPanel}
        </Screen>
      )}

      <PremiumCutsSheet
        visible={showPremium}
        onClose={closePremiumCuts}
        onUnlocked={closePremiumCuts}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  landscapeScreen: {
    flex: 1,
    maxWidth: 1_100,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  landscapeColumns: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
  },
  landscapePhotoColumn: {
    flex: 0.84,
    minWidth: 270,
    maxWidth: 420,
  },
  landscapeDivider: {
    width: 1,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.borderStrong,
  },
  landscapeChoices: {
    flex: 1,
  },
  landscapeChoicesContent: {
    flexGrow: 1,
    paddingRight: spacing.sm,
    paddingBottom: spacing.xl,
  },
  previewCard: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  previewCardLandscape: {
    height: 0,
    minHeight: 116,
    maxHeight: 230,
    flexGrow: 1,
    flexShrink: 1,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewHidden: {
    opacity: 0,
  },
  previewStatus: {
    position: 'absolute',
    zIndex: 1,
  },
  previewError: {
    position: 'absolute',
    zIndex: 1,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.xl,
  },
  meta: {
    marginTop: spacing.md,
  },
  metaLandscape: {
    marginTop: spacing.sm,
  },
  category: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  credit: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.xs,
    marginTop: spacing.xs,
  },
  creditText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  creditLinkTarget: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditLink: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textDecorationLine: 'underline',
  },
  creditLinkPressed: {
    opacity: 0.72,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  firstLandscapeTitle: {
    marginTop: 0,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -spacing.xs,
    marginBottom: spacing.lg,
  },
  cutOptions: {
    gap: spacing.md,
  },
  cutOption: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
    backgroundColor: colors.surface,
  },
  cutCopy: {
    flex: 1,
  },
  cutTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cutDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  premiumBadge: {
    alignSelf: 'flex-start',
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  freeBadge: {
    alignSelf: 'flex-start',
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  difficultyOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  difficultyOption: {
    flexGrow: 1,
    flexBasis: 108,
    minWidth: 88,
    minHeight: 138,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
    backgroundColor: colors.surface,
  },
  guideOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  guideOption: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 142,
    minHeight: MIN_TOUCH_TARGET * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.interactiveBorder,
    backgroundColor: colors.surface,
  },
  guideIcon: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  guideCopy: {
    flex: 1,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  optionPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  gridPreview: {
    width: 46,
    height: 46,
    gap: 2,
    marginBottom: spacing.md,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
  },
  gridCell: {
    flex: 1,
    borderRadius: 1.5,
    backgroundColor: colors.borderStrong,
  },
  gridCellActive: {
    backgroundColor: colors.accent,
  },
  optionTitleRow: {
    minHeight: MIN_TOUCH_TARGET / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  optionLabelActive: {
    color: colors.textPrimary,
  },
  optionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actionPanel: {},
  actionPanelLandscape: {
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
  error: {
    color: colors.danger,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});
