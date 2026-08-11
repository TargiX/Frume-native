import {
  Canvas,
  DashPathEffect,
  FractalNoise,
  Group,
  LinearGradient,
  Path,
  Rect,
  Skia,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type {
  PuzzleGuideMode,
  PuzzleLayout,
  PuzzleTableAppearance,
} from '../types';
import { DrawBoardImage } from './DrawBoardImage';
import { PUZZLE_LIGHT_DIRECTION } from './lighting';
import { resolveBoardMaterial } from './photoGlassStyle';
import { PUZZLE_SURFACE_COLORS } from './surfacePalette';

type BoardSurfaceProps = {
  layout: PuzzleLayout;
  guideMode?: PuzzleGuideMode;
  skiaImage?: SkImage | null;
  appearance?: PuzzleTableAppearance;
  /**
   * The player's view, applied inside the canvas rather than to it. Magnifying
   * what Skia already drew thickens every guide line; redrawing at the new size
   * keeps them a hair wide at any zoom.
   */
  transform?: SharedValue<Transforms3d>;
};

/**
 * The empty board pieces are assembled on.
 *
 * Deliberately borderless — a stroked perimeter reads as a window frame and
 * competes with the photo. Depth comes from a gradient aligned with the key
 * light, and the material from two noise frequencies: fine grain alone looks
 * like digital noise, while broad mottling underneath it reads as felt.
 */
export function BoardSurface({
  layout,
  guideMode = 'cuts',
  skiaImage,
  appearance = 'felt',
  transform,
}: BoardSurfaceProps) {
  const { width, height } = layout.boardSize;
  const material = resolveBoardMaterial(appearance);

  const gradientStart = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return {
      x: width * (0.5 + (light.x / length) * 0.5),
      y: height * (0.5 + (light.y / length) * 0.5),
    };
  });
  const gradientEnd = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return {
      x: width * (0.5 - (light.x / length) * 0.5),
      y: height * (0.5 - (light.y / length) * 0.5),
    };
  });

  const cutGuide = useMemo(() => {
    if (guideMode !== 'cuts') {
      return null;
    }
    return layout.pieces.flatMap((piece) => {
      const path = Skia.Path.MakeFromSVGString(piece.path);
      if (!path) {
        return [];
      }
      return [
        <Path
          key={`${piece.id}-cut`}
          path={path}
          style="stroke"
          strokeWidth={1.4}
          color={PUZZLE_SURFACE_COLORS.guideCut}
        />,
        <Path
          key={`${piece.id}-edge`}
          path={path}
          style="stroke"
          strokeWidth={0.55}
          color={PUZZLE_SURFACE_COLORS.guideEdge}
        />,
      ];
    });
  }, [guideMode, layout.pieces]);
  const gridGuide = useMemo(() => {
    if (guideMode !== 'grid') {
      return null;
    }
    const rows =
      Math.max(...layout.pieces.map((piece) => piece.row), 0) + 1;
    const columns =
      Math.max(...layout.pieces.map((piece) => piece.col), 0) + 1;
    const lines: React.ReactNode[] = [];

    for (let column = 1; column < columns; column += 1) {
      const x = (width * column) / columns;
      const path = Skia.Path.Make();
      path.moveTo(x, 0);
      path.lineTo(x, height);
      lines.push(
        <Path
          key={`grid-column-${column}`}
          path={path}
          style="stroke"
          strokeWidth={1.2}
          color={PUZZLE_SURFACE_COLORS.guideCut}
        >
          <DashPathEffect intervals={[6, 5]} />
        </Path>,
      );
    }
    for (let row = 1; row < rows; row += 1) {
      const y = (height * row) / rows;
      const path = Skia.Path.Make();
      path.moveTo(0, y);
      path.lineTo(width, y);
      lines.push(
        <Path
          key={`grid-row-${row}`}
          path={path}
          style="stroke"
          strokeWidth={1.2}
          color={PUZZLE_SURFACE_COLORS.guideCut}
        >
          <DashPathEffect intervals={[6, 5]} />
        </Path>,
      );
    }
    return lines;
  }, [guideMode, height, layout.pieces, width]);

  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Group transform={transform}>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={gradientStart}
          end={gradientEnd}
          colors={[material.lit, material.shaded]}
        />
      </Rect>

      {/* Broad mottling, then fine fibre on top of it. */}
      <Rect x={0} y={0} width={width} height={height} opacity={material.coarseNoiseOpacity} blendMode="softLight">
        <FractalNoise freqX={0.004} freqY={0.004} octaves={3} seed={11} />
      </Rect>
      <Rect x={0} y={0} width={width} height={height} opacity={material.fineNoiseOpacity} blendMode="softLight">
        <FractalNoise freqX={0.5} freqY={0.5} octaves={2} seed={29} />
      </Rect>

      {guideMode === 'image' && skiaImage ? (
        <Group opacity={material.imageGuideOpacity}>
          <DrawBoardImage
            skiaImage={skiaImage}
            boardWidth={width}
            boardHeight={height}
          />
        </Group>
      ) : null}
      {gridGuide ? <Group>{gridGuide}</Group> : null}
      {cutGuide ? <Group>{cutGuide}</Group> : null}
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
});
