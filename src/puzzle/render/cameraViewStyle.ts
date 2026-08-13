import type { BoardCamera } from '../interaction/boardCamera';

export type CameraViewStyle = {
  transformOrigin: [number, number, number];
  transform: [
    { translateX: number },
    { translateY: number },
    { scale: number },
  ];
};

/**
 * Mirrors the board camera onto React Native views layered over the Skia scene.
 */
export function resolveCameraViewStyle(
  camera: BoardCamera,
): CameraViewStyle {
  'worklet';
  return {
    // Skia's scene transform is applied from the canvas origin. React Native
    // otherwise scales views around their centre, which makes the shelf and
    // gesture overlays drift away from the pieces during a pinch.
    transformOrigin: [0, 0, 0],
    transform: [
      { translateX: camera.x },
      { translateY: camera.y },
      { scale: camera.scale },
    ],
  };
}
