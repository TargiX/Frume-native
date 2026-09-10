import React, { useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Screen } from '../../../components/Screen';
import { Button } from '../../../components/Button';
import type { PuzzleImageSource } from '../../../puzzle/types';
import { displayImageUri } from '../../../puzzle/discoveryAsset';
import { colors, spacing } from '../../../theme';

/** Looking at a finished picture never replaces or mutates the current puzzle. */
export function AlbumViewer({
  image,
  onClose,
}: {
  image: PuzzleImageSource | null;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = image !== null && failedUri === image.uri;
  return (
    <Modal
      visible={image !== null}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <Screen safeTop scroll>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={styles.content}
        >
          <Button label="Back to album" variant="secondary" onPress={onClose} />
          {image ? (
            <>
              <Text accessibilityRole="header" style={styles.title}>
                A moment you finished
              </Text>
              <Image
                key={`${image.uri}:${attempt}`}
                source={{ uri: displayImageUri(image.uri) }}
                style={{
                  width: '100%',
                  aspectRatio: image.width / image.height,
                  maxHeight: height * 0.7,
                }}
                resizeMode="contain"
                accessible
                accessibilityLabel={
                  image.accessibilityLabel ?? 'Your completed puzzle photograph'
                }
                onLoad={() => setFailedUri(null)}
                onError={() => setFailedUri(image.uri)}
              />
              {failed ? (
                <View style={styles.content}>
                  <Text accessibilityLiveRegion="polite" style={styles.detail}>
                    This photograph could not be loaded. Online photographs need
                    a connection; your completed puzzle is still saved.
                  </Text>
                  <Button
                    label="Retry photograph"
                    onPress={() => {
                      setFailedUri(null);
                      setAttempt((value) => value + 1);
                    }}
                  />
                </View>
              ) : null}
              {image.attribution ? (
                <Pressable
                  accessibilityRole="link"
                  style={{ minHeight: 44, justifyContent: 'center' }}
                  onPress={() => {
                    void Linking.openURL(
                      image.attribution!.photographerUrl,
                    ).catch(() => undefined);
                  }}
                >
                  <Text style={styles.detail}>
                    Photo by {image.attribution.photographerName} on{' '}
                    {image.attribution.sourceName}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </Screen>
    </Modal>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '600' },
  detail: { color: colors.textSecondary, fontSize: 16, lineHeight: 24 },
});
