import { Canvas, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PuzzleCutterId } from '../../../puzzle/types';
import { colors, radius } from '../../../theme';

type PreviewCutterId = Exclude<PuzzleCutterId, 'fractal'>;

const PREVIEW_PATHS: Record<PreviewCutterId, readonly string[]> = {
  classic: [
    'M 32 3 L 32 14 C 32 11 27 11 27 17 C 27 23 32 23 32 20 L 32 47',
    'M 3 25 L 17 25 C 14 25 14 20 20 20 C 26 20 26 25 23 25 L 61 25',
  ],
  organic: [
    'M 18 3 C 9 11 25 17 15 25 C 7 34 22 40 15 47',
    'M 3 18 C 15 8 26 28 38 17 C 49 7 51 30 61 25',
    'M 38 17 C 34 27 42 37 51 47',
  ],
  biomorphic: [
    'M 31 3 C 33 11 39 16 45 19 C 41 27 42 34 49 46',
    'M 31 3 C 27 12 22 17 15 20 C 20 29 17 38 12 47',
    'M 3 34 C 7 29 10 24 15 20 C 25 24 35 24 45 19 C 52 18 57 14 61 10',
    'M 15 20 C 23 15 28 12 31 3',
  ],
  'living-spectrum': [
    'M 31 3 C 32 8 36 10 34 14 C 32 18 38 19 42 21 C 39 26 43 29 41 33 C 39 38 45 41 48 46',
    'M 31 3 C 29 8 25 10 27 14 C 29 18 22 18 16 21 C 19 26 14 29 16 33 C 18 38 13 42 11 47',
    'M 3 33 C 8 30 8 25 13 24 C 18 23 17 28 22 25 C 28 22 34 26 42 21 C 50 16 53 16 61 11',
  ],
  crystal: [
    'M 31 3 L 34 13 L 44 11 L 41 20 L 51 22 L 47 30 L 55 37 L 46 39 L 49 47',
    'M 31 3 L 28 13 L 18 11 L 21 20 L 11 22 L 15 30 L 7 37 L 16 39 L 13 47',
    'M 11 22 L 21 20 L 27 27 L 37 25 L 41 20 L 51 22 L 61 17',
    'M 3 30 L 11 22',
  ],
  'crystal-quartered': [
    'M 31 3 L 31 12 L 40 12 L 40 21 L 49 21 L 49 32 L 42 32 L 42 47',
    'M 31 3 L 31 12 L 22 12 L 22 21 L 13 21 L 13 32 L 20 32 L 20 47',
    'M 3 26 L 13 26 L 13 21 L 22 21 L 22 16 L 40 16 L 40 21 L 49 21 L 49 26 L 61 26',
  ],
  amoeba: [
    'M 26 3 C 30 9 24 12 29 17 C 35 23 27 26 32 31 C 38 36 30 41 34 47',
    'M 3 21 C 10 17 13 25 20 21 C 27 17 26 26 34 24 C 43 21 44 30 53 27 C 57 26 59 24 61 25',
    'M 34 24 C 40 31 48 34 47 41 C 46 45 50 45 52 47',
  ],
  'amoeba-columnar': [
    'M 21 3 C 26 10 17 14 22 21 C 27 28 18 33 23 40 C 26 44 22 45 21 47',
    'M 43 3 C 48 10 39 14 44 21 C 49 28 40 33 45 40 C 48 44 44 45 43 47',
    'M 3 24 C 9 20 15 26 22 21 C 30 16 37 26 44 21 C 51 16 56 24 61 21',
  ],
};

function makePaths(cutterId: PreviewCutterId): SkPath[] {
  return PREVIEW_PATHS[cutterId].flatMap((pathSource) => {
    const path = Skia.Path.MakeFromSVGString(pathSource);
    return path ? [path] : [];
  });
}

/** A tiny cut sample, not an icon: each option previews its actual seam language. */
export function CutStylePreview({
  cutterId,
  active,
}: {
  cutterId: PreviewCutterId;
  active: boolean;
}) {
  const paths = useMemo(() => makePaths(cutterId), [cutterId]);
  const seamColor = active ? colors.accent : colors.textSecondary;

  return (
    <View
      style={[styles.frame, active && styles.frameActive]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={styles.canvas} pointerEvents="none">
        {paths.map((path, index) => (
          <Path
            key={`${cutterId}-${index}`}
            path={path}
            style="stroke"
            strokeWidth={active ? 1.8 : 1.45}
            strokeCap="round"
            strokeJoin="round"
            color={seamColor}
          />
        ))}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 64,
    height: 50,
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
    width: 64,
    height: 50,
  },
});
