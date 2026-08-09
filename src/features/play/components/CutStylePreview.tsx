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
  width = PREVIEW_WIDTH,
  height = PREVIEW_HEIGHT,
}: {
  cutterId: PreviewCutterId;
  active: boolean;
  /** The sample is drawn to fit, so a bigger frame shows a bigger cut. */
  width?: number;
  height?: number;
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
  const fit = Math.min(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
  const seamColor = active ? colors.accent : colors.textSecondary;

  return (
    <View
      style={[styles.frame, { width, height }, active && styles.frameActive]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={{ width, height }} pointerEvents="none">
        <Group
          transform={
            sample
              ? [
                  { scale: fit },
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
                (active ? 1.4 : 1.1) /
                ((sample?.transform.scale ?? 1) * fit)
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
});
