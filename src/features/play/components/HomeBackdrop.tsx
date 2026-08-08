import {
  Canvas,
  LinearGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import React from 'react';
import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { PHOTO_GLASS_BLUR_RADIUS } from '../../../puzzle/render';

/**
 * Dark enough at every stop for the brass accent and body copy to keep their
 * contrast over any photograph, while the top stays open enough to read as a
 * photograph rather than a flat panel.
 */
const SCRIM_COLORS = [
  'rgba(20, 18, 15, 0.34)',
  'rgba(20, 18, 15, 0.62)',
  'rgba(20, 18, 15, 0.94)',
] as const;
const SCRIM_POSITIONS = [0, 0.45, 0.82] as const;

type HomeBackdropProps = {
  /** The same photograph the print on top shows, out of focus behind it. */
  source: ImageSourcePropType;
};

/**
 * Full-bleed, heavily blurred photograph behind Home: the print's own colours,
 * thrown out of focus, so the screen reads as one photograph on a table rather
 * than a picture pasted onto a background.
 */
export function HomeBackdrop({ source }: HomeBackdropProps) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[styles.fill, { width, height }]} pointerEvents="none">
      <Image
        source={source}
        style={[styles.fill, { width, height }]}
        resizeMode="cover"
        blurRadius={PHOTO_GLASS_BLUR_RADIUS}
        accessible={false}
      />
      <Canvas style={[styles.fill, { width, height }]}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            positions={[...SCRIM_POSITIONS]}
            colors={[...SCRIM_COLORS]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
