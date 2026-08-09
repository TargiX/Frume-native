import { Canvas, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PuzzleCutterId } from '../../../puzzle/types';
import { colors, radius } from '../../../theme';
import {
  cutPreviewSample,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  type CutPreviewSample,
} from './cutPreviewSample';

type PreviewCutterId = Exclude<PuzzleCutterId, 'fractal'>;

function toPaths(sources: readonly string[]): SkPath[] {
  return sources.flatMap((source) => {
    const path = Skia.Path.MakeFromSVGString(source);
    return path ? [path] : [];
  });
}

/**
 * An actual sample of the cut, not an icon: the smallest grid this style can
 * produce, drawn at icon size, so the picker shows the seams the player gets.
 */
export function CutStylePreview({
  cutterId,
  active,
}: {
  cutterId: PreviewCutterId;
  active: boolean;
}) {
  const [sample, setSample] = useState<CutPreviewSample | null>(() => {
    const ready = cutPreviewSample(cutterId);
    return ready instanceof Promise ? null : ready;
  });

  useEffect(() => {
    let current = true;
    const requested = cutPreviewSample(cutterId);
    if (!(requested instanceof Promise)) {
      setSample(requested);
      return;
    }
    void requested
      .then((resolved) => {
        if (current) {
          setSample(resolved);
        }
      })
      // An icon is not worth an error state; the frame simply stays empty.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [cutterId]);

  const paths = useMemo(
    () => (sample ? toPaths(sample.paths) : []),
    [sample],
  );
  const seamColor = active ? colors.accent : colors.textSecondary;

  return (
    <View
      style={[styles.frame, active && styles.frameActive]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={styles.canvas} pointerEvents="none">
        <Group
          transform={
            sample
              ? [
                  { translateX: sample.transform.translateX },
                  { translateY: sample.transform.translateY },
                  { scale: sample.transform.scale },
                ]
              : []
          }
        >
          {paths.map((path, index) => (
            <Path
              key={`${cutterId}-${index}`}
              path={path}
              style="stroke"
              strokeWidth={
                (active ? 1.4 : 1.1) / (sample?.transform.scale ?? 1)
              }
              strokeCap="round"
              strokeJoin="round"
              color={seamColor}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  frameActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  canvas: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
});
