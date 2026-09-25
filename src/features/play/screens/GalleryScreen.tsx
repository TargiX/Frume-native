import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { track } from '../../../analytics';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import type { PlayStackParamList } from '../../../navigation/types';
import {
  BUNDLED_PHOTOS,
  type BundledPhoto,
} from '../../../puzzle/bundledPhotos';
import { bundledAssetForId } from '../../../puzzle/bundledAssets';
import { usePuzzleSessionContext } from '../../../puzzle/context';
import {
  fetchPuzzlePhoto,
  PUZZLE_CATEGORIES,
  resolvePuzzlePhotoTargetAspect,
} from '../../../services/unsplash';
import { colors, radius, spacing } from '../../../theme';
import { resolveGalleryLayout } from '../utils/galleryLayout';
import {
  buildDifficultyRouteParams,
  describePhotoRequestError,
} from '../utils/photoRequest';
import { pickOwnPhoto } from '../utils/pickOwnPhoto';
import { discardManagedOwnPhotoCandidate } from '../utils/ownPhotoLibrary';
import { CATEGORY_COVERS } from './categoryCovers';
import {
  galleryRetryAccessibilityHint,
  galleryRetryAccessibilityLabel,
  retryGalleryPhoto,
  type GalleryPhotoAttempt,
} from './galleryRetry';

type Props = NativeStackScreenProps<PlayStackParamList, 'Gallery'>;

export function GalleryScreen({ navigation }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { session } = usePuzzleSessionContext();
  // The saved puzzle's photograph must survive the cleanup an import runs.
  const sessionImageUri = session?.layout.image.uri;
  const retryActionRef = useRef<(() => void) | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const lastAttemptRef = useRef<GalleryPhotoAttempt | null>(null);
  const nextRequestIdRef = useRef(0);
  const loading = pending !== null;
  const pendingCategory = PUZZLE_CATEGORIES.find(
    (category) => category.id === pending,
  );
  const loadingMessage =
    pending === 'surprise'
      ? 'Finding a surprise photo…'
      : pendingCategory
        ? `Finding a photo for ${pendingCategory.label}…`
        : null;
  // Accessibility Dynamic Type turns even short labels into wide display
  // text. A single column gives each label room without capping font scaling.
  const useSingleColumnCards = width <= 480 && fontScale >= 1.6;
  const { compactLandscape, cardWidth } = resolveGalleryLayout({
    width,
    height,
    fontScale,
    horizontalSafeArea: insets.left + insets.right,
  });
  const photoOrientation = height >= width ? 'portrait' : 'landscape';
  const targetPhotoAspect = resolvePuzzlePhotoTargetAspect(
    width - insets.left - insets.right,
    height - insets.top - insets.bottom,
  );
  useAccessibilityAnnouncement(isFocused ? loadingMessage : null);
  useAccessibilityAnnouncement(isFocused ? error : null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, []);

  const pickPhoto = async (categoryId?: string) => {
    requestRef.current?.controller.abort(
      new Error('Replaced by a newer photo selection'),
    );
    const requestId = ++nextRequestIdRef.current;
    const controller = new AbortController();
    requestRef.current = { id: requestId, controller };
    lastAttemptRef.current = { source: 'remote', categoryId };
    retryActionRef.current = () => void pickPhoto(categoryId);
    setPending(categoryId ?? 'surprise');
    setError(null);
    try {
      const result = await fetchPuzzlePhoto(
        categoryId,
        controller.signal,
        photoOrientation,
        targetPhotoAspect ?? undefined,
      );
      if (
        !mountedRef.current ||
        requestRef.current?.id !== requestId ||
        controller.signal.aborted
      ) {
        return;
      }
      if (!result) {
        setError('No suitable photo found. Try another theme.');
        return;
      }
      // Recorded on reaching setup rather than on the tap, so the step counts
      // players who actually got a photograph to work with.
      track('photo_source_chosen', {
        source: 'theme',
        theme_id: categoryId ?? 'surprise',
      });
      navigation.navigate(
        'Difficulty',
        buildDifficultyRouteParams(result, categoryId),
      );
    } catch (requestError) {
      if (
        mountedRef.current &&
        requestRef.current?.id === requestId &&
        !controller.signal.aborted
      ) {
        setError(describePhotoRequestError(requestError));
      }
    } finally {
      if (requestRef.current?.id === requestId) {
        requestRef.current = null;
        if (mountedRef.current) {
          setPending(null);
        }
      }
    }
  };

  const useOwnPhoto = async () => {
    requestRef.current?.controller.abort(
      new Error('Replaced by an imported photograph'),
    );
    requestRef.current = null;
    nextRequestIdRef.current += 1;
    lastAttemptRef.current = { source: 'own' };
    retryActionRef.current = () => void useOwnPhoto();
    setPending(null);
    setError(null);

    const result = await pickOwnPhoto([sessionImageUri]);
    if (!mountedRef.current) {
      if (result.status === 'picked') {
        await discardManagedOwnPhotoCandidate(result.photo.uri);
      }
      return;
    }
    if (result.status === 'cancelled') {
      return;
    }
    if (result.status === 'rejected') {
      setError(result.message);
      return;
    }
    setPending(null);
    track('photo_source_chosen', { source: 'own_photo' });
    navigation.navigate('Difficulty', {
      imageUri: result.photo.uri,
      imageWidth: result.photo.width,
      imageHeight: result.photo.height,
      photoDescription: 'Your own photograph',
      ownPhotoCandidateUri: result.photo.uri,
    });
  };

  const useBundledPhoto = (photo: BundledPhoto) => {
    requestRef.current?.controller.abort(
      new Error('Replaced by an offline photograph'),
    );
    requestRef.current = null;
    nextRequestIdRef.current += 1;
    setPending(null);
    setError(null);
    track('photo_source_chosen', { source: 'bundled' });
    navigation.navigate('Difficulty', {
      imageUri: photo.uri,
      imageWidth: photo.width,
      imageHeight: photo.height,
      photoDescription: photo.accessibilityLabel,
      photographerName: photo.attribution.photographerName,
      photographerUrl: photo.attribution.photographerUrl,
      attributionSourceUrl: photo.attribution.sourceUrl,
      bundledPhotoId: photo.id,
    });
  };

  const retryLastPhoto = () => {
    if (retryActionRef.current) {
      retryActionRef.current();
      return;
    }
    retryGalleryPhoto(lastAttemptRef.current, {
      searchPhoto: (categoryId) => void pickPhoto(categoryId),
      pickOwnPhoto: () => void useOwnPhoto(),
    });
  };

  const surprisePending = pending === 'surprise';
  const footer = (
    <View style={styles.footerContent}>
      {error ? (
        <View style={styles.errorRow}>
          <Text
            style={styles.error}
            accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
          >
            {error}
          </Text>
          <Pressable
            onPress={retryLastPhoto}
            accessibilityRole="button"
            accessibilityLabel={galleryRetryAccessibilityLabel(
              lastAttemptRef.current,
            )}
            accessibilityHint={galleryRetryAccessibilityHint(
              lastAttemptRef.current,
            )}
            hitSlop={12}
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.entryActions,
          fontScale >= 1.4 && styles.entryActionsStacked,
        ]}
      >
        <View style={styles.entryAction}>
          <Button
            label={surprisePending ? 'Finding…' : 'Surprise me'}
            variant="secondary"
            block
            disabled={surprisePending}
            onPress={() => void pickPhoto()}
            accessibilityHint="Finds a random photograph and opens puzzle setup"
          />
        </View>
        <View style={styles.entryAction}>
          <Button
            label="Use my photo"
            variant="primary"
            block
            onPress={() => void useOwnPhoto()}
            accessibilityHint="Opens your photo library to cut one of your own photographs"
          />
        </View>
      </View>
    </View>
  );

  return (
    <Screen
      scroll
      style={compactLandscape ? styles.landscapeContent : styles.content}
      footer={footer}
      footerStyle={styles.footer}
    >
      <Text style={styles.sectionTitle} accessibilityRole="header">
        Themes
      </Text>
      <View style={[styles.grid, compactLandscape && styles.gridLandscape]}>
        {PUZZLE_CATEGORIES.map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityLabel={category.label}
            accessibilityHint="Shows photographs from this theme"
            style={({ pressed }) => [
              styles.card,
              compactLandscape && [
                styles.cardLandscape,
                { width: cardWidth ?? undefined },
              ],
              useSingleColumnCards && styles.cardSingleColumn,
              pressed && styles.cardPressed,
            ]}
            onPress={() =>
              navigation.navigate('ThemePhotos', { categoryId: category.id })
            }
          >
            <ImageBackground
              source={CATEGORY_COVERS[category.id]}
              style={styles.cover}
              imageStyle={styles.coverImage}
            >
              {/* Keeps the label legible whatever the photograph does. */}
              <View style={styles.scrim} />
              <Text style={styles.cardLabel}>{category.label}</Text>
            </ImageBackground>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Plays offline
      </Text>
      <Text style={styles.sectionDetail}>
        Built into Frume, so they work with no connection.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.offlineScroller}
        contentContainerStyle={styles.offlineRow}
      >
        {BUNDLED_PHOTOS.map((photo) => (
          <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={`${photo.title} by ${photo.attribution.photographerName}`}
            accessibilityHint="Plays offline. Opens puzzle setup."
            disabled={loading}
            onPress={() => useBundledPhoto(photo)}
            style={({ pressed }) => [
              styles.offlineItem,
              pressed && styles.cardPressed,
            ]}
          >
            <Image
              source={bundledAssetForId(photo.id)}
              style={styles.offlineThumb}
              accessibilityLabel={photo.accessibilityLabel}
            />
            <Text style={styles.offlineName} numberOfLines={1}>
              {photo.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
  },
  landscapeContent: {
    maxWidth: 1_080,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  sectionDetail: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  gridLandscape: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    aspectRatio: 1.45,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardLandscape: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    aspectRatio: 2.05,
  },
  cardSingleColumn: {
    flexBasis: '100%',
    minWidth: '100%',
    minHeight: 132,
    aspectRatio: undefined,
  },
  cardPressed: {
    opacity: 0.82,
  },
  cover: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  coverImage: {
    borderRadius: radius.md,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 10, 8, 0.38)',
  },
  cardLabel: {
    flexShrink: 1,
    maxWidth: '100%',
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 8,
  },
  // Bleeds to the screen edges so the last thumbnail visibly runs off: the
  // row reads as something to swipe, not as three photos and some padding.
  offlineScroller: {
    marginHorizontal: -spacing.xl,
  },
  offlineRow: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  offlineItem: {
    width: 148,
    gap: spacing.xs,
  },
  offlineThumb: {
    width: 148,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  offlineName: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerContent: {
    gap: spacing.sm,
  },
  entryActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  entryActionsStacked: {
    flexDirection: 'column',
  },
  entryAction: {
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
  },
  error: {
    flexShrink: 1,
    color: colors.danger,
    fontSize: 14,
  },
  retry: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
