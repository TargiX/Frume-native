import {
  Canvas,
  FractalNoise,
  RadialGradient,
  Rect,
} from '@shopify/react-native-skia';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import type { PuzzleTableAppearance } from '../types';
import { PUZZLE_LIGHT_DIRECTION } from './lighting';
import {
  PHOTO_GLASS_BLUR_RADIUS,
  PHOTO_GLASS_TINT,
  PHOTO_GLASS_VIGNETTE,
} from './photoGlassStyle';
import { PUZZLE_SURFACE_COLORS } from './surfacePalette';

type TableSurfaceProps = {
  width: number;
  height: number;
  appearance?: PuzzleTableAppearance;
  imageUri?: string;
};

/** Quiet graphite table treatment behind the edge-to-edge board. */
export function TableSurface({
  width,
  height,
  appearance = 'felt',
  imageUri,
}: TableSurfaceProps) {
  const photoGlass = appearance === 'photo-glass' && !!imageUri;
  const lightCenter = useDerivedValue(() => ({
    x: width * (0.5 + PUZZLE_LIGHT_DIRECTION.value.x * 0.2),
    y: height * (0.5 + PUZZLE_LIGHT_DIRECTION.value.y * 0.2),
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      {photoGlass ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.photoBackdrop}
          resizeMode="cover"
          blurRadius={PHOTO_GLASS_BLUR_RADIUS}
          accessible={false}
        />
      ) : null}
      <Canvas style={styles.canvas} pointerEvents="none">
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          color={
            photoGlass
              ? PHOTO_GLASS_TINT
              : PUZZLE_SURFACE_COLORS.tableBase
          }
        />
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          opacity={photoGlass ? 0.055 : 0.035}
          blendMode="softLight"
        >
          <FractalNoise freqX={0.018} freqY={0.018} octaves={2} seed={31} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={lightCenter}
            r={Math.max(width, height) * 0.92}
            colors={
              photoGlass
                ? PHOTO_GLASS_VIGNETTE
                : ['rgba(255, 255, 255, 0.075)', 'rgba(0, 0, 0, 0.2)']
            }
          />
        </Rect>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  photoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.1 }],
  },
});
