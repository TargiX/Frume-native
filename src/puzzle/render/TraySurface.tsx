import { Canvas, FractalNoise, LinearGradient, Rect } from '@shopify/react-native-skia';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { PuzzleTableAppearance } from '../types';
import { resolveTrayMaterial } from './photoGlassStyle';

type TraySurfaceProps = {
  width: number;
  height: number;
  placement?: 'bottom' | 'right';
  appearance?: PuzzleTableAppearance;
};

/**
 * The strip the unplaced pieces rest in.
 *
 * Reads as a shallow recess below the board: darker than the board, lit from
 * the top edge so pieces sitting in it look contained rather than floating.
 * Borderless on purpose — a stroked outline would fight the board above it.
 */
export function TraySurface({
  width,
  height,
  placement = 'bottom',
  appearance = 'felt',
}: TraySurfaceProps) {
  const sideTray = placement === 'right';
  const material = resolveTrayMaterial(appearance);
  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={sideTray ? { x: width, y: 0 } : { x: 0, y: height }}
          colors={[material.top, material.bottom]}
        />
      </Rect>

      {/* Same two-frequency felt as the board, so the recess is one material. */}
      <Rect x={0} y={0} width={width} height={height} opacity={material.coarseNoiseOpacity} blendMode="softLight">
        <FractalNoise freqX={0.004} freqY={0.004} octaves={3} seed={11} />
      </Rect>
      <Rect x={0} y={0} width={width} height={height} opacity={material.fineNoiseOpacity} blendMode="softLight">
        <FractalNoise freqX={0.5} freqY={0.5} octaves={2} seed={43} />
      </Rect>

      {/* Contact shadow where the tray meets the board. */}
      <Rect
        x={0}
        y={0}
        width={sideTray ? 10 : width}
        height={sideTray ? height : 10}
      >
        <LinearGradient
          start={{ x: 0, y: 0 }}
          end={sideTray ? { x: 10, y: 0 } : { x: 0, y: 10 }}
          colors={[material.contactShadow, 'rgba(0, 0, 0, 0)']}
        />
      </Rect>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});
