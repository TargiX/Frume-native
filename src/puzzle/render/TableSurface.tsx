import {
  Canvas,
  FractalNoise,
  RadialGradient,
  Rect,
} from '@shopify/react-native-skia';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { displayImageUri } from '../discoveryAsset';
import type { PuzzleTableAppearance } from '../types';
import { PUZZLE_LIGHT_DIRECTION } from './lighting';
import {
  PHOTO_GLASS_BLUR_RADIUS,
  PHOTO_GLASS_TINT,
  PHOTO_GLASS_VIGNETTE,
} from './photoGlassStyle';
import {
  LINEN_SURFACE_COLORS,
  PUZZLE_SURFACE_COLORS,
} from './surfacePalette';

type TableSurfaceProps = {
  width: number;
  height: number;
  appearance?: PuzzleTableAppearance;
  imageUri?: string;
};

/**
 * The table treatment behind the edge-to-edge board: deep felt, photo-tinted
 * glass, or light linen. Only glass blurs the photograph itself; the other two
 * are flat materials the pieces sit on.
 */
export function TableSurface({
  width,
  height,
  appearance = 'felt',
  imageUri,
}: TableSurfaceProps) {
  // Bundled photographs carry a frume:// URI; resolve it to the packaged file
  // before handing it to the platform image loader.
  const photoGlassUri =
    appearance === 'photo-glass' && imageUri
      ? displayImageUri(imageUri)
      : undefined;
  const photoGlass = photoGlassUri !== undefined;
  const linen = appearance === 'linen' && !photoGlass;
  const tableBase = photoGlass
    ? PHOTO_GLASS_TINT
    : linen
      ? LINEN_SURFACE_COLORS.tableBase
      : PUZZLE_SURFACE_COLORS.tableBase;
  const vignette = photoGlass
    ? PHOTO_GLASS_VIGNETTE
    : linen
      ? ['rgba(255, 255, 255, 0.5)', 'rgba(112, 96, 70, 0.16)']
      : ['rgba(255, 255, 255, 0.075)', 'rgba(0, 0, 0, 0.2)'];
  const lightCenter = useDerivedValue(() => ({
    x: width * (0.5 + PUZZLE_LIGHT_DIRECTION.value.x * 0.2),
    y: height * (0.5 + PUZZLE_LIGHT_DIRECTION.value.y * 0.2),
  }));

  return (
    <View style={styles.canvas} pointerEvents="none">
      {photoGlass ? (
        <Image
          source={{ uri: photoGlassUri }}
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
          color={tableBase}
        />
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          opacity={photoGlass ? 0.055 : linen ? 0.045 : 0.035}
          blendMode="softLight"
        >
          <FractalNoise freqX={0.018} freqY={0.018} octaves={2} seed={31} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient
            c={lightCenter}
            r={Math.max(width, height) * 0.92}
            colors={vignette}
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
