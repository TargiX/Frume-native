import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { track } from '../../../analytics';
import { Button } from '../../../components/Button';
import { MAX_CONTENT_WIDTH } from '../../../components/Screen';
import type { PlayStackParamList } from '../../../navigation/types';
import {
  fetchPuzzlePhoto,
  resolvePuzzlePhotoTargetAspect,
} from '../../../services/unsplash';
import {
  browsePuzzlePhotos,
  type PuzzlePhoto,
} from '../../../services/unsplash/fetchPuzzlePhoto';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';
import {
  buildDifficultyRouteParams,
  describePhotoRequestError,
} from '../utils/photoRequest';

type Props = NativeStackScreenProps<PlayStackParamList, 'ThemePhotos'>;

/**
 * One visit's worth of photographs per theme and viewport. Coming back to a
 * theme shows the same pictures instead of a spinner and a different set;
 * the refresh button is how the player asks for new ones.
 */
const collectionCache = new Map<string, PuzzlePhoto[]>();

/**
 * A theme's photographs as a contact sheet, two to a row. It is its own screen
 * so the back arrow does what it says: one tap returns to the themes, another
 * to home, instead of the collection being a section stacked into the theme
 * list that the arrow skipped straight past.
 */
export function ThemePhotosScreen({ navigation, route }: Props) {
  const { categoryId } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<PuzzlePhoto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<() => void>(() => undefined);
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const photoOrientation = height >= width ? 'portrait' : 'landscape';
  const targetPhotoAspect = resolvePuzzlePhotoTargetAspect(
    width - insets.left - insets.right,
    height - insets.top - insets.bottom,
  );
  const cacheKey = `${categoryId}:${photoOrientation}:${targetPhotoAspect}`;
  const contentWidth =
    Math.min(width - insets.left - insets.right, MAX_CONTENT_WIDTH) -
    spacing.xl * 2;
  const columns = contentWidth >= 560 ? 3 : 2;
  const tileWidth = (contentWidth - spacing.md * (columns - 1)) / columns;

  useAccessibilityAnnouncement(error);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
    };
  }, []);

  const replaceRequest = () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return controller;
  };
  const isCurrent = (controller: AbortController) =>
    mountedRef.current &&
    requestRef.current === controller &&
    !controller.signal.aborted;

  const loadCollection = useCallback(
    async (refresh: boolean) => {
      if (refresh) collectionCache.delete(cacheKey);
      const cached = collectionCache.get(cacheKey);
      if (cached) {
        setPhotos(cached);
        return;
      }
      const controller = replaceRequest();
      retryRef.current = () => void loadCollection(false);
      setLoading(true);
      setPickingId(null);
      setError(null);
      try {
        const next = await browsePuzzlePhotos(
          categoryId,
          controller.signal,
          photoOrientation,
          targetPhotoAspect ?? undefined,
        );
        if (!isCurrent(controller)) return;
        collectionCache.set(cacheKey, next);
        setPhotos(next);
      } catch (caught) {
        if (isCurrent(controller)) setError(describePhotoRequestError(caught));
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          if (mountedRef.current) setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey, categoryId],
  );

  useEffect(() => {
    void loadCollection(false);
  }, [loadCollection]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show other photographs"
          disabled={loading}
          hitSlop={8}
          onPress={() => void loadCollection(true)}
          style={({ pressed }) => [
            styles.headerButton,
            (pressed || loading) && styles.headerButtonDim,
          ]}
        >
          <Ionicons name="refresh" size={22} color={colors.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, loadCollection, loading]);

  const choosePhoto = async (photo: PuzzlePhoto) => {
    const controller = replaceRequest();
    retryRef.current = () => void choosePhoto(photo);
    setPickingId(photo.id);
    setError(null);
    try {
      const result = await fetchPuzzlePhoto(
        categoryId,
        controller.signal,
        photo.height > photo.width ? 'portrait' : 'landscape',
        photo.width / photo.height,
        photo.id,
      );
      if (!isCurrent(controller)) return;
      if (!result) {
        setError('That photograph is no longer available. Try another.');
        return;
      }
      track('photo_source_chosen', { source: 'theme', theme_id: categoryId });
      navigation.navigate(
        'Difficulty',
        buildDifficultyRouteParams(result, categoryId),
      );
    } catch (caught) {
      if (isCurrent(controller)) setError(describePhotoRequestError(caught));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current) setPickingId(null);
      }
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingLeft: spacing.xl + insets.left,
          paddingRight: spacing.xl + insets.right,
          paddingBottom: spacing.xl + insets.bottom,
        },
      ]}
    >
      {error ? (
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
            size="compact"
            onPress={() => retryRef.current()}
          />
        </View>
      ) : null}

      <View style={styles.grid}>
        {loading || !photos
          ? Array.from({ length: columns * 2 }, (_, index) => (
              <View
                key={index}
                style={[styles.tile, { width: tileWidth }]}
                importantForAccessibility="no-hide-descendants"
              >
                <View style={[styles.photo, styles.placeholder]}>
                  {index === 0 && loading ? (
                    <ActivityIndicator color={colors.textSecondary} />
                  ) : null}
                </View>
                <View style={styles.creditPlaceholder} />
              </View>
            ))
          : photos.map((photo) => {
              const picking = pickingId === photo.id;
              return (
                <View
                  key={photo.id}
                  style={[styles.tile, { width: tileWidth }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      photo.alt_description ?? 'Choose this photograph'
                    }
                    accessibilityHint="Opens puzzle setup"
                    accessibilityState={{ busy: picking }}
                    disabled={pickingId !== null}
                    onPress={() => void choosePhoto(photo)}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <Image
                      source={{ uri: photo.urls.regular }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                    {picking ? (
                      <View style={styles.pickingOverlay}>
                        <ActivityIndicator color={colors.textPrimary} />
                      </View>
                    ) : null}
                  </Pressable>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Photo by ${photo.user.name} on Unsplash`}
                    onPress={() =>
                      void Linking.openURL(photo.user.links.html).catch(
                        () => undefined,
                      )
                    }
                    style={styles.credit}
                  >
                    <Text style={styles.creditText} numberOfLines={1}>
                      {photo.user.name}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
      </View>

      {photos && !loading ? (
        <Text style={styles.source}>Photographs from Unsplash</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingTop: spacing.lg,
  },
  headerButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonDim: {
    opacity: 0.45,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.lg,
  },
  tile: {
    gap: spacing.xs,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  pickingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 10, 8, 0.5)',
  },
  credit: {
    minHeight: 28,
    justifyContent: 'center',
  },
  creditText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  creditPlaceholder: {
    height: 10,
    width: '55%',
    marginVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  source: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  errorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  error: {
    flexShrink: 1,
    color: colors.danger,
  },
});
