import type { BoardCamera } from './boardCamera';

export type Point = { x: number; y: number };

export function boardPointToViewport(
  point: Point,
  camera: BoardCamera,
  surfaceOrigin: Point,
): Point {
  'worklet';
  return {
    x: camera.x + (surfaceOrigin.x + point.x) * camera.scale,
    y: camera.y + (surfaceOrigin.y + point.y) * camera.scale,
  };
}

export function viewportPointToBoard(
  point: Point,
  camera: BoardCamera,
  surfaceOrigin: Point,
): Point {
  'worklet';
  const scale = camera.scale || 1;
  return {
    x: (point.x - camera.x) / scale - surfaceOrigin.x,
    y: (point.y - camera.y) / scale - surfaceOrigin.y,
  };
}

export function piecePointToViewport({
  point,
  trayAttached,
  trayOffset,
  camera,
  surfaceOrigin,
}: {
  point: Point;
  trayAttached: boolean;
  trayOffset: Point;
  camera: BoardCamera;
  surfaceOrigin: Point;
}): Point {
  'worklet';
  if (trayAttached) {
    return {
      x: surfaceOrigin.x + point.x + trayOffset.x,
      y: surfaceOrigin.y + point.y + trayOffset.y,
    };
  }
  return boardPointToViewport(point, camera, surfaceOrigin);
}
