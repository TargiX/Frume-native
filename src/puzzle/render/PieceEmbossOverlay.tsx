import { Group, LinearGradient, Path, type SkPath } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';

import { PUZZLE_LIGHT_DIRECTION } from './lighting';

/** Thickness of the cardboard edge, in points. */
const BEVEL_WIDTH = 2.2;

type PieceEmbossOverlayProps = {
  path: SkPath;
};

/**
 * Directional cardboard edge.
 *
 * Stroking a closed contour evenly reads as a raised 90s window border, so each
 * stroke is painted with a gradient running along the key light instead: the
 * highlight exists only on the lit half and fades to nothing before it reaches
 * the shaded half, and the shadow does the reverse. Contours running parallel
 * to the light get almost no bevel, which is what makes a piece read as a
 * physical object rather than an outlined sticker. Everything is clipped to the
 * piece so no stroke leaks outside the cardboard.
 */
export function PieceEmbossOverlay({ path }: PieceEmbossOverlayProps) {
  const bounds = useMemo(() => path.getBounds(), [path]);

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const reach = Math.max(bounds.width, bounds.height) * 0.5;

  const litPoint = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return {
      x: centerX + (light.x / length) * reach,
      y: centerY + (light.y / length) * reach,
    };
  });
  const shadedPoint = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return {
      x: centerX - (light.x / length) * reach,
      y: centerY - (light.y / length) * reach,
    };
  });

  // Nudge each stroke slightly along the light so the bevel sits on the edge
  // of the cardboard instead of straddling the contour symmetrically.
  const litOffset = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return [
      { translateX: (light.x / length) * 0.8 },
      { translateY: (light.y / length) * 0.8 },
    ];
  });
  const shadedOffset = useDerivedValue(() => {
    const light = PUZZLE_LIGHT_DIRECTION.value;
    const length = Math.hypot(light.x, light.y) || 1;
    return [
      { translateX: -(light.x / length) * 0.8 },
      { translateY: -(light.y / length) * 0.8 },
    ];
  });

  return (
    <Group clip={path}>
      <Path
        path={path}
        style="stroke"
        strokeWidth={BEVEL_WIDTH}
        strokeJoin="round"
        transform={litOffset}
      >
        <LinearGradient
          start={litPoint}
          end={shadedPoint}
          positions={[0, 0.5]}
          colors={['rgba(255, 250, 242, 0.28)', 'rgba(255, 250, 242, 0)']}
        />
      </Path>

      <Path
        path={path}
        style="stroke"
        strokeWidth={BEVEL_WIDTH}
        strokeJoin="round"
        transform={shadedOffset}
      >
        <LinearGradient
          start={litPoint}
          end={shadedPoint}
          positions={[0.5, 1]}
          colors={['rgba(20, 15, 10, 0)', 'rgba(20, 15, 10, 0.4)']}
        />
      </Path>
    </Group>
  );
}
