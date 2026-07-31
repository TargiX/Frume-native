import { useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
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
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import type { PlayStackParamList } from '../../../navigation/types';
import {
  fetchPuzzlePhoto,
  PhotoApiError,
  PUZZLE_CATEGORIES,
  resolvePuzzlePhotoTargetAspect,
} from '../../../services/unsplash';
import { colors, radius, spacing } from '../../../theme';
import {
  resolveGalleryLayout,
} from '../utils/galleryLayout';
import { CATEGORY_COVERS } from './categoryCovers';

type Props = NativeStackScreenProps<PlayStackParamList, 'Gallery'>;

export function GalleryScreen({ navigation }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const lastCategoryRef = useRef<string | undefined>(undefined);
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
    lastCategoryRef.current = categoryId;
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
      const { photo, category } = result;
      navigation.navigate('Difficulty', {
        imageUri: photo.urls.regular,
        imageWidth: photo.width,
        imageHeight: photo.height,
        photographerName: photo.user.name,
        photographerUrl: photo.user.links?.html,
        photoDescription: photo.alt_description ?? undefined,
        categoryLabel: category.label,
        downloadLocation: photo.links.download_location,
        trackingToken: result.tracking_token,
      });
    } catch (requestError) {
      if (
        mountedRef.current &&
        requestRef.current?.id === requestId &&
        !controller.signal.aborted
      ) {
        setError(
          requestError instanceof PhotoApiError &&
            requestError.code === 'request_timeout'
            ? 'The photo service took too long. Please try again.'
            : 'Failed to load photo. Please try again.',
        );
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

  return (
    <Screen
      scroll
      style={compactLandscape ? styles.landscapeContent : undefined}
    >
      <View style={compactLandscape ? styles.landscapeHeader : undefined}>
        <View style={styles.titleGroup}>
          <Text style={styles.title} accessibilityRole="header">
            Choose a theme
          </Text>
          {compactLandscape && error ? (
            <View style={styles.landscapeErrorRow}>
              <Text
                style={styles.landscapeError}
                accessibilityLiveRegion={androidAccessibilityLiveRegion(
                  'polite',
                )}
              >
                {error}
              </Text>
              <Pressable
                onPress={() => pickPhoto(lastCategoryRef.current)}
                accessibilityRole="button"
                accessibilityLabel="Try photo search again"
                hitSlop={12}
              >
                <Text style={styles.landscapeRetry}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <Text
              style={[
                styles.subtitle,
                compactLandscape && styles.subtitleLandscape,
              ]}
            >
              Landscapes, cities, animals — no abstract patterns
            </Text>
          )}
        </View>
        {compactLandscape ? (
          <Button
            label="Surprise me"
            variant="secondary"
            onPress={() => pickPhoto()}
            accessibilityHint={
              loading
                ? 'Cancels the current search and finds a surprise photo instead'
                : undefined
            }
          />
        ) : null}
      </View>

      <View style={[styles.grid, compactLandscape && styles.gridLandscape]}>
        {PUZZLE_CATEGORIES.map((category) => {
          const isPending = pending === category.id;
          const coverContent = (
            <>
              {/* Keeps the label legible whatever the photograph does. */}
              <View style={styles.scrim} />
              {isPending ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.cardLabel}>{category.label}</Text>
              )}
            </>
          );

          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={category.label}
              accessibilityHint={
                loading && !isPending
                  ? 'Cancels the current search and finds this theme instead'
                  : undefined
              }
              accessibilityState={{ busy: isPending }}
              style={({ pressed }) => [
                styles.card,
                compactLandscape && [
                  styles.cardLandscape,
                  { width: cardWidth ?? undefined },
                ],
                useSingleColumnCards && styles.cardSingleColumn,
                pressed && styles.cardPressed,
              ]}
              onPress={() => pickPhoto(category.id)}
            >
              <ImageBackground
                source={CATEGORY_COVERS[category.id]}
                style={styles.cover}
                imageStyle={styles.coverImage}
              >
                {coverContent}
              </ImageBackground>
            </Pressable>
          );
        })}
      </View>

      {!compactLandscape ? (
        <Button
          label="Surprise me"
          variant="secondary"
          onPress={() => pickPhoto()}
          accessibilityHint={
            loading
              ? 'Cancels the current search and finds a surprise photo instead'
              : undefined
          }
        />
      ) : null}

      {loadingMessage ? (
        <Text
          style={styles.status}
          accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
        >
          {loadingMessage}
        </Text>
      ) : null}

      {error && !compactLandscape ? (
        <View style={styles.errorGroup}>
          <Text
            style={styles.error}
            accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
          >
            {error}
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => pickPhoto(lastCategoryRef.current)}
            accessibilityHint="Retries your last photo selection"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  landscapeContent: {
    maxWidth: 1_080,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  landscapeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xl,
    marginBottom: spacing.lg,
  },
  titleGroup: {
    flexShrink: 1,
  },
  landscapeErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    minHeight: 20,
  },
  landscapeError: {
    flexShrink: 1,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  landscapeRetry: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  subtitleLandscape: {
    marginBottom: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  gridLandscape: {
    gap: spacing.sm,
    marginBottom: 0,
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
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  coverImage: {
    borderRadius: radius.md,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 10, 8, 0.56)',
  },
  cardLabel: {
    flexShrink: 1,
    maxWidth: '100%',
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 8,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
  },
  errorGroup: {
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
