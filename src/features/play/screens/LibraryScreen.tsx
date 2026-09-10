import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Screen } from '../../../components/Screen';
import { Button } from '../../../components/Button';
import type { PlayStackParamList } from '../../../navigation/types';
import { usePuzzleSessionContext } from '../../../puzzle/context';
import {
  puzzleLibrary,
  libraryPuzzleId,
  type LibraryPuzzle,
} from '../../../puzzle/persistence/PuzzleLibrary';
import { displayImageUri } from '../../../puzzle/discoveryAsset';
import { colors, spacing, radius } from '../../../theme';
import { puzzleCutStyleLabel } from '../cutStylePresentation';
import { reconcileOwnPhotoOwnership } from '../utils/ownPhotoLibrary';
import { PremiumCutsSheet } from '../components/PremiumCutsSheet';
import { isPremiumCutter, usePremiumAccess } from '../../../premium';
import { isDiscoveryPuzzle } from '../../../puzzle/discovery';
import type { PuzzleImageSource } from '../../../puzzle/types';
import { AlbumViewer } from '../components/AlbumViewer';
import { openLibraryEntry } from '../utils/openLibraryEntry';

type Props = NativeStackScreenProps<PlayStackParamList, 'Library'>;
export function LibraryScreen({ navigation }: Props) {
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);
  const unlockTarget = useRef<string | null>(null);
  const {
    session,
    completion,
    openLibraryPuzzle,
    loading,
    clearSession,
    clearCompletion,
  } = usePuzzleSessionContext();
  const sessionRef = useRef(session);
  const completionRef = useRef(completion);
  useEffect(() => {
    sessionRef.current = session;
    completionRef.current = completion;
  }, [session, completion]);
  const { isPremium } = usePremiumAccess();
  const [entries, setEntries] = useState<LibraryPuzzle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [viewedImage, setViewedImage] = useState<PuzzleImageSource | null>(
    null,
  );
  const openingRef = useRef(false);
  const openGenerationRef = useRef(0);
  useEffect(
    () => () => {
      openGenerationRef.current += 1;
    },
    [focused],
  );
  const [premiumId, setPremiumId] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const refresh = () => {
      void puzzleLibrary
        .load()
        .then((items) => {
          if (current) {
            setEntries(items);
            setError(null);
          }
        })
        .catch(() => {
          if (current)
            setError(
              'Your shelf could not be loaded. Try again by reopening this screen.',
            );
        });
    };
    refresh();
    const unsubscribe = puzzleLibrary.subscribe(refresh);
    return () => {
      current = false;
      unsubscribe();
    };
  }, [focused]);
  const activeId = session
    ? libraryPuzzleId({ ...session, engine: session.engine.getSnapshot() })
    : null;
  const open = async (entry: LibraryPuzzle, unlocked = false) => {
    if (openingRef.current || pending || loading || !focusedRef.current) return;
    openingRef.current = true;
    const generation = ++openGenerationRef.current;
    setPending(entry.id);
    try {
      const result = await openLibraryEntry(entry, {
        isCurrent: () =>
          focusedRef.current && generation === openGenerationRef.current,
        viewCompleted: (saved) =>
          setViewedImage(saved.snapshot.engine.layout.image),
        hasAccess: () => {
          const { snapshot } = entry;
          if (
            !unlocked &&
            !isPremium &&
            isPremiumCutter(snapshot.cutterId) &&
            !isDiscoveryPuzzle(
              snapshot.engine.layout.image,
              snapshot.cutterId,
              snapshot.difficulty,
            )
          ) {
            unlockTarget.current = entry.id;
            setPremiumId(entry.id);
            return false;
          }
          return true;
        },
        openSession: (id) =>
          entry.id === activeId && session
            ? Promise.resolve(session)
            : openLibraryPuzzle(id),
      });
      if (result.kind === 'opened')
        navigation.navigate('Game', { difficulty: result.session.difficulty });
      if (result.kind === 'failed')
        setError(
          'This puzzle could not be opened. Your progress is still saved.',
        );
    } catch {
      if (focusedRef.current)
        setError(
          'This puzzle could not be opened. Your progress is still saved.',
        );
    } finally {
      openingRef.current = false;
      setPending(null);
    }
  };
  const remove = (entry: LibraryPuzzle) =>
    Alert.alert(
      'Remove this puzzle?',
      'Its saved progress and album entry will be removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setPending(entry.id);
            void (async () => {
              if (entry.id === activeId) {
                clearSession();
                sessionRef.current = null;
              }
              const image = entry.snapshot.engine.layout.image;
              const removesLastResult =
                completion?.image.uri === image.uri &&
                completion?.cutterId === entry.snapshot.cutterId &&
                completion?.difficulty === entry.snapshot.difficulty &&
                entry.snapshot.engine.status === 'completed';
              if (removesLastResult) {
                if (!(await clearCompletion()))
                  throw new Error('Last result could not be removed');
                completionRef.current = null;
              }
              await puzzleLibrary.remove(entry.id);
              const ownedSession = sessionRef.current;
              const ownedCompletion = completionRef.current;
              await reconcileOwnPhotoOwnership(
                [
                  ownedSession?.layout.image.uri,
                  ownedCompletion?.image.uri,
                ],
                () =>
                  focusedRef.current &&
                  sessionRef.current === ownedSession &&
                  completionRef.current === ownedCompletion,
              );
            })()
              .catch(() =>
                setError('The puzzle could not be removed. Try again.'),
              )
              .finally(() => setPending(null));
          },
        },
      ],
    );
  const legacyCompletion =
    completion &&
    !entries.some(
      (entry) =>
        entry.snapshot.engine.status === 'completed' &&
        entry.snapshot.engine.layout.image.uri === completion.image.uri &&
        entry.snapshot.cutterId === completion.cutterId &&
        entry.snapshot.difficulty === completion.difficulty,
    )
      ? completion
      : null;
  const renderGroup = (title: string, complete: boolean) => {
    const items = entries.filter(
      (entry) =>
        (entry.snapshot.engine.status === 'completed') === complete &&
        (complete || entry.id !== activeId),
    );
    return (
      <View style={styles.section}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {!items.length && !(complete && legacyCompletion) ? (
          <Text style={styles.detail}>
            {complete
              ? 'Your 24 most recently saved completed photographs will gather here.'
              : 'Start another puzzle whenever you like. Up to four can wait here while you play.'}
          </Text>
        ) : null}
        {complete && legacyCompletion ? (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View your last completed photograph"
              onPress={() => setViewedImage(legacyCompletion.image)}
            >
              <Image
                source={{ uri: displayImageUri(legacyCompletion.image.uri) }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={
                  legacyCompletion.image.accessibilityLabel ??
                  'Your last completed puzzle'
                }
              />
            </Pressable>
            <View style={styles.caption}>
              <Text style={styles.name}>Last completed</Text>
              <Text style={styles.detail}>
                {puzzleCutStyleLabel(legacyCompletion.cutterId)} ·{' '}
                {legacyCompletion.pieceCount} pieces
              </Text>
            </View>
            {legacyCompletion.image.attribution ? (
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  void Linking.openURL(
                    legacyCompletion.image.attribution!.photographerUrl,
                  ).catch(() => undefined)
                }
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.md,
                }}
              >
                <Text style={styles.detail}>
                  Photo by {legacyCompletion.image.attribution.photographerName}{' '}
                  on Unsplash
                </Text>
              </Pressable>
            ) : null}
            <Button
              label="Remove last result"
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  'Remove your last result?',
                  'This removes the saved result from this device.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => {
                        void clearCompletion().then((removed) => {
                          if (!removed)
                            setError(
                              'The last result could not be removed. Try again.',
                            );
                        });
                      },
                    },
                  ],
                )
              }
            />
          </View>
        ) : null}
        {items.map((entry) => {
          const { snapshot } = entry;
          const image = snapshot.engine.layout.image;
          const count = Object.values(snapshot.engine.pieces).filter(
            (piece) => piece.locked,
          ).length;
          return (
            <View key={entry.id} style={styles.card}>
              <Pressable
                disabled={!!pending || loading}
                accessibilityRole="button"
                accessibilityLabel={`${image.accessibilityLabel ?? 'Saved puzzle'}, ${count} of ${snapshot.engine.layout.pieces.length} pieces. ${complete ? 'View completed image' : 'Continue'}`}
                onPress={() => void open(entry)}
                style={styles.open}
              >
                <Image
                  source={{ uri: displayImageUri(image.uri) }}
                  style={styles.image}
                />
                <View style={styles.caption}>
                  <Text style={styles.name}>
                    {image.contentSource?.kind === 'bundled'
                      ? 'Coastal morning'
                      : image.contentSource?.kind === 'own'
                        ? 'Your photograph'
                        : (image.contentSource?.categoryLabel ??
                          'A quiet moment')}
                  </Text>
                  <Text style={styles.detail}>
                    {puzzleCutStyleLabel(snapshot.cutterId)} · {count}/
                    {snapshot.engine.layout.pieces.length} pieces
                    {pending === entry.id ? ' · Opening…' : ''}
                  </Text>
                </View>
              </Pressable>
              {image.attribution ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Photo by ${image.attribution.photographerName} on ${image.attribution.sourceName}`}
                  onPress={() =>
                    void Linking.openURL(
                      image.attribution!.photographerUrl,
                    ).catch(() => undefined)
                  }
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <Text style={styles.detail}>
                    Photo by {image.attribution.photographerName} on{' '}
                    {image.attribution.sourceName}
                  </Text>
                </Pressable>
              ) : null}
              <Button
                label="Remove"
                variant="ghost"
                disabled={!!pending || loading}
                onPress={() => remove(entry)}
              />
            </View>
          );
        })}
      </View>
    );
  };
  return (
    <Screen scroll>
      <Text style={styles.intro}>
        A little space for the pictures you spend time with.
      </Text>
      {session ? (
        <Button
          label="Back to your current puzzle"
          onPress={() => navigation.navigate('PlayHome')}
          variant="secondary"
        />
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {renderGroup('On your shelf', false)}
      {renderGroup('Your album', true)}
      <AlbumViewer image={viewedImage} onClose={() => setViewedImage(null)} />
      <PremiumCutsSheet
        visible={premiumId !== null}
        onClose={() => setPremiumId(null)}
        onUnlocked={() => {
          const entry = entries.find(
            (item) => item.id === unlockTarget.current,
          );
          setPremiumId(null);
          if (entry) void open(entry, true);
        }}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 25, fontWeight: '600' },
  intro: {
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 25,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  open: { gap: spacing.md },
  image: { width: '100%', aspectRatio: 1.5 },
  caption: { paddingHorizontal: spacing.md, gap: spacing.xs },
  name: { color: colors.textPrimary, fontSize: 19, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  error: { color: colors.textSecondary, marginTop: spacing.md },
});
